#!/usr/bin/env bun
// Pull the campus off OpenStreetMap once and cache it. Buildings give us the
// shapes to draw and label; the footways and roads give us a graph to walk.
//
//   bun scripts/fetch-map.mjs [--force]
//
// Writes data/campus.osm.json. Overpass is slow and rate limited, so the build
// reads the cache and never touches the network.

import { existsSync } from "fs";
import * as path from "path";

const OUT = path.join(import.meta.dir, "../data/campus.osm.json");
const BBOX = [39.7385, -83.8155, 39.7525, -83.7975]; // s, w, n, e — Cedarville University

if (existsSync(OUT) && !process.argv.includes("--force")) {
  console.log(`${OUT} already exists; pass --force to refetch`);
  process.exit(0);
}

const query = `
[out:json][timeout:120];
(
  way["building"](${BBOX});
  relation["building"](${BBOX});
  way["highway"~"^(footway|path|pedestrian|steps|cycleway|service|residential|unclassified|tertiary|secondary|primary|living_street|track)$"](${BBOX});
  node["amenity"~"^(parking|cafe|restaurant|library)$"](${BBOX});
);
out body geom;
`;

const endpoints = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
];

for (const url of endpoints) {
  process.stdout.write(`asking ${new URL(url).host}… `);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        "user-agent": "assassins-dossier/1.0 (https://tangled.org/dunkirk.sh/assassins)",
      },
      body: "data=" + encodeURIComponent(query),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    await Bun.write(OUT, JSON.stringify(json));
    const kinds = json.elements.reduce((a, e) => ((a[e.tags?.building ? "building" : e.tags?.highway ? "way" : "other"] ??= 0), a[e.tags?.building ? "building" : e.tags?.highway ? "way" : "other"]++, a), {});
    console.log(`ok — ${json.elements.length} elements`, kinds);
    process.exit(0);
  } catch (e) {
    console.log(`failed (${e.message})`);
  }
}
console.error("every Overpass mirror refused; try again later");
process.exit(1);
