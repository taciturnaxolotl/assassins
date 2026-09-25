#!/usr/bin/env bun
// Put the mirrored directory headshots into cedarengine.
//
//   bun scripts/push-headshots.mjs --dry
//   bun scripts/push-headshots.mjs
//
// The directory's own photograph of somebody sits behind SSO, so `photoUrl` on
// a person is a path nothing outside Cedarville can fetch. These are the ones
// already mirrored out to l4, and unlike everything else this repo pushes they
// have nothing to do with GroupMe or with this game: they are keyed by student
// id, so no roster is involved and no join has to be right.
//
// Kept apart from push-groupme.mjs for exactly that reason. A source that can
// be wrong about who somebody is deserves a different level of trust from one
// that cannot.

import { readFileSync } from "fs";
import * as path from "path";
import { get, pool, post } from "./engine.mjs";

const ROOT = path.join(import.meta.dir, "..");
const dry = process.argv.includes("--dry");

const mirrored = Object.entries(
  JSON.parse(readFileSync(path.join(ROOT, "data/directory-photos.json"), "utf8")),
);

console.log(`${mirrored.length} mirrored headshots${dry ? " (dry run)" : ""}\n`);

const results = await pool(mirrored, 6, async ([studentId, url]) => {
  const person = await get(`/v1/people/${studentId}`, { allow404: true });
  if (!person) return { missing: true };
  if (dry) return {};

  await post(`/v1/people/${studentId}/facts`, {
    source: "directory-mirror",
    facts: [{ key: "photo", slot: url, value: { url, kind: "directory", rotate: 0 } }],
  });
  return {};
});

const missing = results.filter((r) => r.missing).length;
console.log(
  `${results.length - missing} headshot${results.length - missing === 1 ? "" : "s"} ` +
    `${dry ? "would be written" : "written"}` +
    (missing ? `, ${missing} no longer in the directory` : ""),
);
