#!/usr/bin/env bun
// Put everything GroupMe knows about these people into cedarengine.
//
//   bun scripts/push-groupme.mjs --dry     # say what would happen
//   bun scripts/push-groupme.mjs
//
// Run it after `bun run data`, which is where the join happens. This reads the
// result rather than redoing it: the build already worked out that GroupMe
// user 143374923 is student 2750438, and that answer is worth more than this
// game. The next thing that touches this directory should not have to earn it
// again from a roster scrape and eighteen lines of hand identification.
//
// What goes across, all under the `assassins` source so it can be told apart
// from anything the directory itself claims:
//
//   groupme.id        the account, as a plain value so it can be looked up
//                     backwards — given an id, who is that?
//   groupme.name      what they call themselves there, which is often not
//                     what the directory calls them
//   groupme.id.note   why somebody decided this by hand, for the thirteen
//                     that needed deciding
//   photo             every photograph, one per url, so adding a fourteenth
//                     never rewrites the other thirteen
//
// Reference photos stay out unless --photos is passed. They were posted for a
// game, and moving them into the directory database is a decision worth making
// on purpose rather than as a side effect of a sync.

import { Database } from "bun:sqlite";
import { existsSync, readFileSync } from "fs";
import * as path from "path";
import { get, pool, post } from "./engine.mjs";

const ROOT = path.join(import.meta.dir, "..");
const dry = process.argv.includes("--dry");
const withPhotos = process.argv.includes("--photos");

const d1 = path.join(ROOT, ".wrangler/state/v3/d1/miniflare-D1DatabaseObject");
const file = existsSync(d1)
  ? Array.from(new Bun.Glob("*.sqlite").scanSync(d1))
      .map((name) => path.join(d1, name))
      .find((candidate) => {
        const probe = new Database(candidate, { readonly: true });
        const has = probe
          .query("SELECT count(*) AS n FROM sqlite_master WHERE name = 'player'")
          .get();
        probe.close();
        return has?.n === 1;
      })
  : null;

if (!file) {
  console.error("No local roster found. Run `bun run data` first.");
  process.exit(1);
}

const players = new Database(file, { readonly: true })
  .query("SELECT gm_id, name, student_id, avatar, photos, gallery FROM player WHERE matched = 1")
  .all();

// The reasons live in the tsv and nowhere else; the build throws them away
// once it has used the id.
const notes = new Map();
for (const line of readFileSync(path.join(ROOT, "data/overrides.tsv"), "utf8").split("\n")) {
  if (!line || line.startsWith("#")) continue;
  const [userId, studentId, note] = line.split("\t");
  if (userId && studentId && studentId !== "?" && note?.trim()) notes.set(userId, note.trim());
}

const shots = (json) => {
  try {
    return JSON.parse(json || "[]");
  } catch {
    return [];
  }
};

console.log(`${players.length} resolved players${dry ? " (dry run)" : ""}\n`);

let written = 0;
let missing = 0;
let photos = 0;

const results = await pool(players, 6, async (player) => {
  if (!(await get(`/v1/people/${player.student_id}`, { allow404: true }))) return { missing: true };

  const facts = [
    { key: "groupme.id", value: player.gm_id },
    { key: "groupme.name", value: player.name },
  ];
  const note = notes.get(player.gm_id);
  if (note) facts.push({ key: "groupme.id.note", value: note });

  if (withPhotos) {
    const seen = new Set();
    for (const shot of [
      ...(player.avatar ? [{ ...JSON.parse(player.avatar), kind: "avatar" }] : []),
      ...shots(player.gallery).map((s) => ({ ...s, kind: "gallery" })),
      ...shots(player.photos).map((s) => ({ ...s, kind: "reference" })),
    ]) {
      if (!shot?.url || seen.has(shot.url)) continue;
      seen.add(shot.url);
      // The url is the slot, so re-running this is idempotent per photograph
      // rather than piling up duplicates of the same face.
      facts.push({ key: "photo", slot: shot.url, value: shot });
    }
  }

  if (dry) return { facts: facts.length, photos: facts.filter((f) => f.key === "photo").length };

  await post(`/v1/people/${player.student_id}/facts`, { source: "assassins", facts });
  return { facts: facts.length, photos: facts.filter((f) => f.key === "photo").length };
});

for (const result of results) {
  if (result.missing) {
    missing++;
    continue;
  }
  written++;
  photos += result.photos;
}

console.log(
  `${written} people${dry ? " would get" : " given"} facts` +
    (withPhotos ? `, ${photos} photographs` : ", photographs skipped (pass --photos)") +
    (missing ? `, ${missing} no longer in the directory` : ""),
);
if (!dry) console.log("\n  /v1/facts?key=groupme.id&value=<id>   who is this\n  /v1/facts/keys");
