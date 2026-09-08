#!/usr/bin/env bun
// Join the GroupMe roster against everything we know about Cedarville students
// write the result straight into D1. The join has no life as a file.
//
//   bun run data            # into the local database
//   bun run data:remote     # into the real one
//
// Inputs (all read-only, all owned by other projects except data/*.tsv):
//   data/groupme-roster.tsv        everyone in the group, scraped from it
//   data/reference-photos.tsv      the photos topic, which is also the roll
//   data/reference-photos.tsv      what each player posted in the photos topic
//   data/overrides.tsv             manual name -> student id resolutions
//   data/buildings.tsv             catalog building names -> OpenStreetMap ones
//   data/campus.osm.json           the campus, from `bun scripts/fetch-map.mjs`
//   data/tour-buildings.json       halls OSM lacks, from `bun scripts/pin-buildings.mjs`
//   cedarstalk-raycast/data        the directory: dorm, room, class, hometown
//   cedar-major-pipeline/data      booklists, which leak each player's sections
//   the-cedarville-app/.data       the catalog: when and where those meet

import { Database } from "bun:sqlite";
import { existsSync, readFileSync } from "fs";
import { unlink } from "fs/promises";
import * as os from "os";
import * as path from "path";
import { buildMap } from "./map.mjs";
import { buildModel } from "../../cedar-major-pipeline/lib.mjs";
import { PROGRAMS_JSON } from "../../cedar-major-pipeline/config.mjs";

const ROOT = path.join(import.meta.dir, "..");
const STALK = path.join(ROOT, "../cedarstalk-raycast/data");
const PIPE = path.join(ROOT, "../cedar-major-pipeline/data");
const CATALOG = path.join(ROOT, "../the-cedarville-app/.data/catalog.sqlite");
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

const dir = new Database(path.join(STALK, "directory.db"), { readonly: true });
const people = dir.query("SELECT * FROM people").all();
const byId = new Map(people.map((p) => [String(p.Id), p]));

const byName = new Map();
for (const p of people) {
  for (const first of [p.FirstName, p.Nickname].filter(Boolean)) {
    const k = norm(first + p.LastName);
    if (!byName.has(k)) byName.set(k, new Map());
    byName.get(k).set(String(p.Id), p);
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
const enrolled = people.filter((p) => ["FR", "SO", "JR", "SR"].includes(p.StudentClass));
const suggest = (name) => {
  const toks = name.split(/\s+/).map(norm).filter(Boolean);
  return enrolled
    .map((p) => {
      const [fn, ln, nk] = [norm(p.FirstName), norm(p.LastName), norm(p.Nickname)];
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

// students.tsv carries hometown and gender, which the directory doesn't.
const extra = new Map();
for (const s of tsv(path.join(STALK, "students.tsv"))) {
  extra.set(norm(s["First Name"] + s["Last Name"]), s);
}

const mirrored = JSON.parse(readFileSync(path.join(STALK, "photos.json"), "utf8"));

const dormGender = new Map(
  tsv(path.join(STALK, "dorm-gender.tsv")).map((d) => [d.Dorm, d.Gender]),
);

// ─── schedules ──────────────────────────────────────────────────────────────

// The campus store's per-student booklist names the exact sections they're in.
const sectionsOf = new Map();
const harvest = JSON.parse(readFileSync(path.join(PIPE, `harvests/${TERM}.json`), "utf8"));
for (const row of harvest) {
  const set = new Set();
  for (const b of row.books ?? []) {
    const dept = (b.department ?? "").split("-")[0];
    const course = (b.course ?? "").split("-")[0];
    const sec = (b.section ?? "").split("-")[0];
    if (dept && course && sec) set.add(`${dept}-${course}-${sec}`);
  }
  if (set.size) sectionsOf.set(String(row.id), set);
}

const cat = new Database(CATALOG, { readonly: true });
const meetings = new Map();
for (const { payload } of cat.query("SELECT payload FROM sections WHERE term = ?").all(TERM)) {
  const s = JSON.parse(payload);
  meetings.set(s.SectionNameDisplay, {
    code: s.CourseName,
    section: s.SectionNameDisplay,
    title: s.SectionTitleDisplay,
    credits: s.MinimumCredits,
    instructor: (s.FacultyDisplay ?? [])[0] ?? null,
    enrolled: s.Enrolled,
    capacity: s.Capacity,
    meets: (s.FormattedMeetingTimes ?? []).map((m) => ({
      days: m.Days ?? [],
      start: m.StartTimeDisplay || null,
      end: m.EndTimeDisplay || null,
      building: m.BuildingDisplay || null,
      room: m.RoomDisplay || null,
      online: !!m.IsOnline,
      kind: m.InstructionalMethodDisplay || null,
    })),
  });
}

// ─── majors ─────────────────────────────────────────────────────────────────

const model = buildModel(PROGRAMS_JSON);
const majorGuess = (sections) => {
  const courses = new Set([...sections].map((s) => s.split("-").slice(0, 2).join("-")));
  if (!courses.size) return [];
  return model
    .guess(courses)
    .ranked.slice(0, 3)
    .map((g) => ({ major: g.title, score: Math.round(g.score * 100) }));
};

// ─── join ───────────────────────────────────────────────────────────────────

const players = roster.map((r) => {
  const candidates = lookup(r.nickname);
  const forced = overrides.get(r.user_id);
  const p = forced ? byId.get(forced) : candidates.length === 1 ? candidates[0] : null;

  const player = {
    gmId: r.user_id,
    name: r.nickname,
    avatar: image(r.image),
    photos: (refs.get(r.user_id) ?? []).map(image),
    gallery: (gallery.get(r.user_id) ?? []).map(image),
    matched: !!p,
  };

  if (!p) {
    player.candidates = (candidates.length ? candidates : suggest(r.nickname)).map((c) => ({
      id: String(c.Id),
      name: `${c.Nickname || c.FirstName} ${c.LastName}`,
      class: c.StudentClass,
      dorm: [c.DormName, c.DormRoom].filter(Boolean).join(" "),
    }));
    return player;
  }

  const e = extra.get(norm(p.FirstName + p.LastName)) ?? extra.get(norm((p.Nickname ?? "") + p.LastName));
  const sections = sectionsOf.get(String(p.Id)) ?? new Set();

  Object.assign(player, {
    id: String(p.Id),
    username: p.Username || null,
    legalName: [p.FirstName, p.MiddleName, p.LastName].filter(Boolean).join(" "),
    class: p.StudentClass,
    dorm: p.DormName,
    room: p.DormRoom,
    gender: e?.Gender ?? dormGender.get(p.DormName) ?? null,
    hometown: e ? [e.Hometown, e.State].filter(Boolean).join(", ") : null,
    directoryPhoto: mirrored[String(p.Id)] ? { url: mirrored[String(p.Id)], rotate: 0 } : null,
    majors: majorGuess(sections),
    schedule: [...sections]
      .map((s) => meetings.get(s) ?? { code: s.split("-").slice(0, 2).join("-"), section: s, title: null, meets: [] })
      .sort((a, b) => a.section.localeCompare(b.section)),
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

const labels = tsv(path.join(ROOT, "data/buildings.tsv"));
// Outlines for the halls OSM never mapped, lifted from Cedarville's own campus
// tour by scripts/pin-buildings.mjs.
const tourFile = path.join(ROOT, "data/tour-buildings.json");
const tour = existsSync(tourFile) ? JSON.parse(readFileSync(tourFile, "utf8")).buildings : {};
const campus = buildMap(path.join(ROOT, "data/campus.osm.json"), labels, tour);

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

// D1 refuses a statement much past 50 KB, and the campus as one blob is twice
// that. Its parts are separate arrays that only travel together, so they store
// that way and `campus()` puts them back.
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
for (const [key, value] of Object.entries(facts))
  rows.push(`INSERT INTO dataset (key, value, built_at) VALUES (${q(key)}, ${j(value)}, ${stamp});`);

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
