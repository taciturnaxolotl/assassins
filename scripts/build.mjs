#!/usr/bin/env bun
// Join the GroupMe roster against everything we know about Cedarville students
// write the result straight into D1. The join has no life as a file.
//
//   bun run data            # into the local database
//   bun run data:remote     # into the real one
//
// Who each player is comes from cedarengine, which is the directory, the course
// catalog, the harvested booklists and the campus map already joined and
// answering over the tailnet. This script used to open three sibling repos by
// absolute path to assemble the same thing, and a build could only run on a
// machine where all four were checked out at once.
//
// What is left here is everything cedarengine cannot know: who is in the group,
// who posted a reference photo, which of two Grace Andersons somebody is, and
// which photographs are the same face twice.
//
// Local inputs:
//   data/groupme-roster.tsv        everyone in the group, scraped from it
//   data/reference-photos.tsv      what each player posted in the photos topic,
//                                  which is also the roll
//   data/profile-photos.tsv        their GroupMe galleries
//   data/directory-photos.json     directory headshots, mirrored off SSO
//   data/overrides.tsv             manual name -> student id resolutions
//   data/photo-{hashes,dupes,fixes}.tsv   the deduplication apparatus

import { existsSync, readFileSync } from "fs";
import { unlink } from "fs/promises";
import * as os from "os";
import * as path from "path";
import { campusMap, directory, get, pool } from "./engine.mjs";

const ROOT = path.join(import.meta.dir, "..");
const TERM = "2026FA";

const norm = (s) => (s ?? "").toLowerCase().normalize("NFD").replace(/[^a-z]/g, "");
const tsv = (file) => {
  const lines = readFileSync(file, "utf8").trim().split("\n").filter((l) => l && !l.startsWith("#"));
  const cols = lines[0].split("\t");
  return lines
    .slice(1)
    .map((r) => Object.fromEntries(r.split("\t").map((v, i) => [cols[i], v ?? ""])));
};

// ─── the players ────────────────────────────────────────────────────────────

const everyone = tsv(path.join(ROOT, "data/groupme-roster.tsv"));

const refs = new Map();
for (const r of tsv(path.join(ROOT, "data/reference-photos.tsv"))) {
  if (!refs.has(r.user_id)) refs.set(r.user_id, []);
  refs.get(r.user_id).push(r.url);
}

// The gallery GroupMe shows when you tap somebody's profile: up to six photos
// they chose to publish, which is better reference material than one avatar.
// Optional — the file may not exist yet.
const galleryFile = path.join(ROOT, "data/profile-photos.tsv");
const gallery = new Map();
if (existsSync(galleryFile)) {
  for (const r of tsv(galleryFile)) {
    // At least one client has uploaded a `content://` path from its own crop
    // cache instead of a URL. Anything that is not really an image is dropped
    // rather than rendered as a broken frame.
    if (!/^https?:\/\//.test(r.url)) continue;
    if (!gallery.has(r.user_id)) gallery.set(r.user_id, []);
    gallery.get(r.user_id).push(r.url);
  }
}

// Chapel. Ten to eleven, every weekday, the whole campus in one building.
//
// It is in nobody's booklist because nobody registers for it, so the catalog
// join can never produce it — and it is the single most useful hour in the
// game, the one time you know where everybody is. Added to every player rather
// than only the matched ones: attendance does not depend on whether the
// directory could work out who somebody is.
const CHAPEL = {
  code: "CHAPEL",
  section: "CHAPEL",
  title: "Chapel",
  credits: 0,
  instructor: null,
  meets: [
    {
      days: [1, 2, 3, 4, 5],
      start: "10:00 AM",
      end: "11:00 AM",
      building: "Dixon Ministry Center",
      room: null,
      online: false,
      kind: "Chapel",
    },
  ],
};

// Colour fingerprints from `bun run photos:hash`, used to notice when somebody
// has posted their profile picture, or a crop of it, as their reference photo.
// Optional: without the file every photo is kept.
const hashFile = path.join(ROOT, "data/photo-hashes.tsv");
const fingerprints = new Map();
if (existsSync(hashFile)) {
  for (const r of tsv(hashFile)) {
    const bins = new Float64Array(512);
    for (let i = 0; i < 512; i++) bins[i] = parseInt(r.hist.slice(i * 2, i * 2 + 2), 16);
    fingerprints.set(r.url, bins);
  }
}

const cosine = (a, b) => {
  let dot = 0, x = 0, y = 0;
  for (let i = 0; i < 512; i++) {
    dot += a[i] * b[i];
    x += a[i] * a[i];
    y += b[i] * b[i];
  }
  return x && y ? dot / Math.sqrt(x * y) : 0;
};

// An identical histogram is the same file re-encoded, and safe to act on alone.
// Anything short of that is not: measured on this roster, a genuine duplicate
// (one photo, two crops) and two different frames from the same photoshoot both
// score 0.974. No threshold separates them, so near matches are proposed by
// `bun run photos:hash` and confirmed by hand here.
const IDENTICAL = 0.999;

const dupeFile = path.join(ROOT, "data/photo-dupes.tsv");
const confirmed = new Set(
  existsSync(dupeFile)
    ? tsv(dupeFile).filter((r) => r.verdict === "drop").map((r) => r.url)
    : [],
);

/**
 * Keep the first of each distinct photograph. Order is the argument: what they
 * posted for this game beats their gallery, which beats an avatar they picked
 * months ago, which beats a year-old directory shot.
 */
function distinct(shots) {
  const kept = [];
  for (const shot of shots) {
    if (!shot) continue;
    if (confirmed.has(shot.url)) {
      duplicates++;
      continue;
    }
    const mine = fingerprints.get(shot.url);
    if (mine && kept.some((k) => {
      const theirs = fingerprints.get(k.url);
      return theirs && cosine(mine, theirs) >= IDENTICAL;
    })) {
      duplicates++;
      continue;
    }
    kept.push(shot);
  }
  return kept;
}
let duplicates = 0;

// Being in the group is not being in the game. Posting a reference photo is the
// entry fee, so the photos topic is the roll: everyone else is a spectator and
// does not belong in the ring, the search, or anybody's list of targets.
const roster = everyone.filter((r) => refs.has(r.user_id));
const spectators = everyone.filter((r) => !refs.has(r.user_id));

const overrides = new Map(
  tsv(path.join(ROOT, "data/overrides.tsv"))
    .filter((r) => r.student_id && r.student_id !== "?")
    .map((r) => [r.user_id, r.student_id]),
);

// Some photos come off a phone sideways; photo-fixes.tsv says how far to turn them.
const rotations = new Map(
  tsv(path.join(ROOT, "data/photo-fixes.tsv")).map((r) => [r.url, Number(r.rotate)]),
);

// GroupMe stores images as a bare path plus dimensions; expand back to a URL.
const image = (s) =>
  !s ? null
  : {
      // The roster stores GroupMe's compact form; the profile galleries were
      // scraped as whole URLs. Both arrive here, so a URL is left alone.
      url: /^https?:\/\//.test(s)
        ? s
        : s.startsWith("U")
          ? `https://m.groupme.com/uploads/${s.slice(1)}`
          : `https://i.groupme.com/${s.replace(/^I/, "")}`,
      rotate: rotations.get(s) ?? 0,
    };

// ─── the directory ──────────────────────────────────────────────────────────

// Both are one request and neither depends on the other, so they go together.
const [people, campus] = await Promise.all([directory(), campusMap()]);

const byId = new Map(people.map((p) => [p.id, p]));

const byName = new Map();
for (const p of people) {
  for (const first of [p.firstName, p.nickname].filter(Boolean)) {
    const k = norm(first + p.lastName);
    if (!byName.has(k)) byName.set(k, new Map());
    byName.get(k).set(p.id, p);
  }
}
const lookup = (name) => {
  const hits = byName.get(norm(name));
  if (hits) return [...hits.values()];
  // "Anna Grace Gage", "Will Simpson III" — try first + last, then drop the tail
  const t = name.split(/\s+/);
  if (t.length > 2) {
    const alt = byName.get(norm(t[0] + t.at(-1))) ?? byName.get(norm(t.slice(0, -1).join("")));
    if (alt) return [...alt.values()];
  }
  return [];
};

// For names the directory can't resolve ("Kylie", "CJ Williams"), offer the
// enrolled undergrads any token of the name could point at. Ranked, not chosen —
// picking between them takes a face, so it goes in overrides.tsv by hand.
const enrolled = people.filter((p) => ["FR", "SO", "JR", "SR"].includes(p.studentClass));
const suggest = (name) => {
  const toks = name.split(/\s+/).map(norm).filter(Boolean);
  return enrolled
    .map((p) => {
      const [fn, ln, nk] = [norm(p.firstName), norm(p.lastName), norm(p.nickname)];
      let score = 0;
      for (const t of toks) {
        if (ln === t) score += 3;
        else if (t.length > 2 && ln.startsWith(t)) score += 2;
        if (fn === t || nk === t) score += 3;
        else if (t.length > 2 && (fn.startsWith(t) || nk.startsWith(t))) score += 2;
      }
      return { score, p };
    })
    .filter((x) => x.score >= 3)
    .sort((a, b) => b.score - a.score)
    .slice(0, 12)
    .map((x) => x.p);
};

// The directory's photographs sit behind SSO, so its own `photoUrl` is a path
// nothing outside Cedarville can fetch. These are the ones already mirrored out
// to l4, by student id.
const mirrored = JSON.parse(readFileSync(path.join(ROOT, "data/directory-photos.json"), "utf8"));

// Which halls are men's and which are women's, off the campus map rather than a
// scraped list. This is a hall's gender, not a person's — the directory has
// never carried that — so it answers for the three and a half thousand students
// who live on campus and says nothing about anybody who commutes.
const dormGender = new Map(
  Object.entries(campus.anchors)
    .filter(([, a]) => a.gender)
    .map(([label, a]) => [label, a.gender]),
);

// ─── schedules and majors ───────────────────────────────────────────────────

// cedarengine keeps time as "13:00", which is the right way to store it and the
// wrong way to read one. Everything downstream parses the clock the way a
// timetable on a wall prints it, so it is converted once, here.
const clock = (t) => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(t ?? "");
  if (!m) return null;
  const h = +m[1];
  return `${h % 12 || 12}:${m[2]} ${h < 12 ? "AM" : "PM"}`;
};

// One section, as the game reads it. Colleague lists co-taught courses as one
// comma-joined string; the dossier has room for a name, not a faculty roster.
const course = (s) => ({
  code: s.code ?? s.name.split("-").slice(0, 2).join("-"),
  section: s.name,
  title: s.title,
  credits: s.credits ?? undefined,
  instructor: (s.faculty ?? "").split(",")[0] || null,
  meets: (s.meetings ?? []).map((m) => ({
    days: m.days ?? [],
    start: clock(m.start),
    end: clock(m.end),
    building: m.building,
    room: m.room,
    online: !!m.online,
    kind: m.kind,
  })),
});

/**
 * What the engine knows about one student: their week and their likely major.
 *
 * A student with no harvested booklist is a 404 on both, which is an answer —
 * they get Chapel and nothing else, the same as before.
 */
async function dossier(id) {
  const [schedule, major] = await Promise.all([
    get(`/v1/people/${id}/schedule?term=${TERM}`, { allow404: true }),
    get(`/v1/people/${id}/major?top=3`, { allow404: true }),
  ]);

  const sections = [
    ...(schedule?.sections ?? []),
    // Online sections meet nobody anywhere, which is worth knowing when the
    // gap they leave in a day looks like a chance.
    ...(schedule?.online ?? []),
  ].map(course);

  // A section the booklist named and the catalog has never heard of. It says
  // the course exists without saying when, which is still a course they are in.
  for (const name of schedule?.unmatched ?? []) {
    sections.push({
      code: name.split("-").slice(0, 2).join("-"),
      section: name,
      title: null,
      meets: [],
    });
  }

  return {
    schedule: sections.sort((a, b) => a.section.localeCompare(b.section)),
    majors: (major?.guesses ?? []).map((g) => ({
      major: g.title,
      score: Math.round(g.score * 100),
    })),
  };
}

// ─── join ───────────────────────────────────────────────────────────────────

// Resolve everybody first, then ask about the ones who resolved. Each question
// is a network hop now, so asking them in a `map` would be eighty round trips
// taken one at a time.
const resolved = roster.map((r) => {
  const candidates = lookup(r.nickname);
  const forced = overrides.get(r.user_id);
  return { r, candidates, p: forced ? byId.get(forced) : candidates.length === 1 ? candidates[0] : null };
});

const files = await pool(resolved, 8, ({ p }) => (p ? dossier(p.id) : null));

const players = resolved.map(({ r, candidates, p }, i) => {
  const player = {
    gmId: r.user_id,
    name: r.nickname,
    avatar: image(r.image),
    photos: (refs.get(r.user_id) ?? []).map(image),
    gallery: (gallery.get(r.user_id) ?? []).map(image),
    matched: !!p,
  };

  if (!p) {
    player.schedule = [CHAPEL];
    player.candidates = (candidates.length ? candidates : suggest(r.nickname)).map((c) => ({
      id: c.id,
      name: `${c.nickname || c.firstName} ${c.lastName}`,
      class: c.studentClass,
      dorm: [c.dormName, c.dormRoom].filter(Boolean).join(" "),
    }));
    return player;
  }

  Object.assign(player, {
    id: p.id,
    username: p.username || null,
    legalName: [p.firstName, p.middleName, p.lastName].filter(Boolean).join(" "),
    class: p.studentClass,
    dorm: p.dormName,
    room: p.dormRoom,
    gender: dormGender.get(p.dormName) ?? null,
    hometown: [p.city, p.state].filter(Boolean).join(", ") || null,
    directoryPhoto: mirrored[p.id] ? { url: mirrored[p.id], rotate: 0 } : null,
    majors: files[i].majors,
    schedule: [CHAPEL, ...files[i].schedule],
  });
  return player;
});

// Somebody's avatar is often the photo they posted, or a crop of it, arriving
// as a separate upload with its own hash. Only the pixels can tell, so this
// runs once the player is whole and every source is in hand.
for (const p of players) {
  const kept = distinct([
    ...(p.photos ?? []),
    ...(p.gallery ?? []),
    p.avatar,
    p.directoryPhoto,
  ]);
  const has = new Set(kept.map((s) => s.url));
  p.photos = (p.photos ?? []).filter((s) => has.has(s.url));
  p.gallery = (p.gallery ?? []).filter((s) => has.has(s.url));
  if (p.avatar && !has.has(p.avatar.url)) p.avatar = null;
  if (p.directoryPhoto && !has.has(p.directoryPhoto.url)) p.directoryPhoto = null;
}

// ─── the campus ─────────────────────────────────────────────────────────────
//
// Fetched at the top, alongside the directory. It used to be built here out of
// a cached Overpass extract and a scrape of Cedarville's campus tour, which is
// the same work cedarengine now does for everybody — and does better, since it
// also carries the College View blocks, Cedar Park and the operations yard,
// pinned off the university's printed map. Three hundred people live inside
// the ground that extract left out.

const matched = players.filter((p) => p.matched);

const out = {
  term: TERM,
  campus,
  builtAt: new Date().toISOString(),
  group: { id: "117059227", name: "ASSASSINS 26" },
  players: players.sort((a, b) => a.name.localeCompare(b.name)),
};

// ─── into the database ──────────────────────────────────────────────────────
//
// The join has no life as a file. It goes straight into D1, so from here on
// fixing a name or resolving one of the seven unidentified players is an
// UPDATE against a running game rather than a rebuild and a redeploy.

const q = (v) => (v == null ? "NULL" : `'${String(v).replaceAll("'", "''")}'`);
const j = (v) => (v == null ? "NULL" : q(JSON.stringify(v)));

const rows = ["PRAGMA defer_foreign_keys = true;", "DELETE FROM player;", "DELETE FROM dataset;"];

const COLUMNS =
  "gm_id, name, avatar, photos, gallery, matched, candidates, student_id, username, " +
  "legal_name, class, dorm, room, gender, hometown, directory_photo, majors, schedule";

for (const p of out.players)
  rows.push(
    `INSERT INTO player (${COLUMNS}) VALUES (` +
      [
        q(p.gmId), q(p.name), j(p.avatar), j(p.photos ?? []), j(p.gallery ?? []),
        p.matched ? 1 : 0,
        j(p.candidates ?? null), q(p.id), q(p.username), q(p.legalName), q(p.class),
        q(p.dorm), q(p.room), q(p.gender), q(p.hometown), j(p.directoryPhoto),
        j(p.majors ?? null), j(p.schedule ?? null),
      ].join(", ") + ");",
  );

// D1 refuses a statement much past 50 KB. The campus has always been stored as
// its parts for that reason, but cedarengine's graph covers more ground than
// the old Overpass extract did — 4,659 path nodes against the handful of
// streets around the academic core — and `nodes` and `edges` are each over the
// limit on their own now.
//
// So a part that does not fit is written as a run of numbered chunks of its
// JSON text: `campus.nodes#0`, `campus.nodes#1`. Splitting the encoded string
// rather than the array means this knows nothing about what it is storing and
// cannot be wrong about a shape it has never seen. `campus()` joins them back.
const CHUNK = 40_000;

const facts = {
  term: out.term,
  group: out.group,
  "campus.origin": campus.origin,
  "campus.box": campus.box,
  "campus.buildings": campus.buildings,
  "campus.nodes": campus.nodes,
  "campus.edges": campus.edges,
  "campus.anchors": campus.anchors,
  "campus.missing": campus.missing,
};
const stamp = Math.floor(Date.parse(out.builtAt) / 1000);
const put = (key, value) =>
  rows.push(`INSERT INTO dataset (key, value, built_at) VALUES (${q(key)}, ${value}, ${stamp});`);

let chunked = 0;
for (const [key, value] of Object.entries(facts)) {
  const text = JSON.stringify(value);
  if (text.length <= CHUNK) {
    put(key, j(value));
    continue;
  }
  // Each chunk is stored as a JSON string, so every row is still valid JSON on
  // its own and the column can stay in json mode.
  for (let i = 0, n = 0; i < text.length; i += CHUNK, n++) {
    put(`${key}#${n}`, j(text.slice(i, i + CHUNK)));
    chunked++;
  }
}

const oversized = rows.filter((r) => r.length > 50_000);
if (oversized.length) {
  console.error(`${oversized.length} statements are too big for D1. Split them.`);
  process.exit(1);
}

const remote = process.argv.includes("--remote");
const sql = path.join(os.tmpdir(), `assassins-seed-${process.pid}.sql`);
await Bun.write(sql, rows.join("\n") + "\n");
try {
  const run = Bun.spawnSync(
    ["bunx", "wrangler", "d1", "execute", "assassins", remote ? "--remote" : "--local", "--file", sql, "-y"],
    { cwd: ROOT, stdout: "inherit", stderr: "inherit" },
  );
  if (run.exitCode !== 0) process.exit(run.exitCode ?? 1);
} finally {
  await unlink(sql).catch(() => {});
}

console.log(
  `campus: ${campus.buildings.length} buildings, ${campus.nodes.length} path nodes, ` +
    `${campus.edges.length} edges, ${Object.keys(campus.anchors).length} anchored` +
    (campus.missing.length ? ` (no location for ${campus.missing.join(", ")})` : ""),
);
console.log(
  `${players.length} playing of ${everyone.length} in the group ` +
    `(${spectators.length} never posted a reference photo)`,
);
console.log(
  `${players.filter((p) => p.gallery.length).length} with profile galleries ` +
    `(${players.reduce((n, p) => n + p.gallery.length, 0)} photos)` +
    (fingerprints.size ? `, ${duplicates} duplicates dropped` : ", no fingerprints yet"),
);
console.log(
  `${matched.length}/${players.length} matched \u00b7 ` +
    `${matched.filter((p) => p.schedule.length).length} with schedules \u00b7 ` +
    `${matched.filter((p) => p.dorm).length} with dorms \u00b7 ` +
    `${players.filter((p) => p.photos.length).length} with reference photos`,
);
for (const p of players.filter((p) => !p.matched)) {
  console.log(`  unmatched  ${p.name}  (${p.candidates.length} candidates)`);
}
console.log(`\n${out.players.length} players written to ${remote ? "the real" : "the local"} database.`);
