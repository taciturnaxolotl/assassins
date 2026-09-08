#!/usr/bin/env bun
// Find the halls OpenStreetMap has never heard of.
//
//   bun scripts/pin-buildings.mjs           # report, and check itself against OSM
//   bun scripts/pin-buildings.mjs --write   # write data/tour-buildings.json
//
// Cedarville's own campus tour draws every building as a polygon over a flat map
// image, in coordinates that mean nothing on their own. It also drops 61 GPS
// markers on that same image, each carrying a real latitude and longitude. Sixty
// one correspondences is far more than an affine fit needs, so we solve for the
// transform once, apply it to the polygons, and read off where the halls are.
//
// The fit is checked against the buildings OSM does know, which is the whole
// reason to trust the ones it doesn't. What comes out is a whole outline per
// building, not a pin: the build anchors a route to the nearest path node to a
// building's edge, and a point at the centre of a dorm is fifty metres from
// every door it has.

import { existsSync, readFileSync } from "fs";
import * as path from "path";

const ROOT = path.join(import.meta.dir, "..");
const TOUR = path.join(ROOT, "data/campus-tour.xml");
const SOURCE = "https://tour.cedarville.edu/xml/CL_cedarville.xml";
const OSM = path.join(ROOT, "data/campus.osm.json");
const TABLE = path.join(ROOT, "data/buildings.tsv");
const OUT = path.join(ROOT, "data/tour-buildings.json");

if (!existsSync(TOUR)) {
  process.stdout.write("fetching the campus tour… ");
  const res = await fetch(SOURCE);
  if (!res.ok) throw new Error(`campus tour returned HTTP ${res.status}`);
  await Bun.write(TOUR, await res.text());
  console.log("cached");
}
const xml = readFileSync(TOUR, "utf8");

// ─── the two things the tour gives us ───────────────────────────────────────

const pointsIn = (block) =>
  [...block.matchAll(/<item\s+y="([-\d.eE]+)"\s+x="([-\d.eE]+)"\s*\/>/g)].map((m) => [+m[2], +m[1]]);

// Markers that know both where they are on the image and where they are on earth.
const anchors = [...xml.matchAll(/<GPS label="[^"]*">([\s\S]*?)<\/GPS>/g)]
  .map(([, body]) => {
    const lat = +(/<latitude>([-\d.]+)<\/latitude>/.exec(body)?.[1] ?? NaN);
    const lon = +(/<longitude>([-\d.]+)<\/longitude>/.exec(body)?.[1] ?? NaN);
    const [pt] = pointsIn(body);
    return pt && Number.isFinite(lat) && Number.isFinite(lon) ? { x: pt[0], y: pt[1], lat, lon } : null;
  })
  .filter(Boolean);

// Building outlines, in image space only.
const shapes = [...xml.matchAll(/<POLY label="[^"]*">([\s\S]*?)<\/POLY>/g)]
  .map(([, body]) => ({
    title: (/<title>([^<]*)<\/title>/.exec(body)?.[1] ?? "").trim(),
    ring: pointsIn(body),
  }))
  .filter((s) => s.title && s.ring.length > 2);

console.log(`${anchors.length} GPS anchors, ${shapes.length} building outlines`);
if (anchors.length < 6) throw new Error("not enough anchors to fit anything");

// ─── image space -> the round earth ─────────────────────────────────────────

// Affine, because the map image may be rotated and stretched but is not warped:
//   lon = a·x + b·y + c        lat = d·x + e·y + f
// Solved by normal equations over all 61 anchors, so no single bad marker matters.
function fitPlane(samples, valueOf) {
  const A = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  const B = [0, 0, 0];
  for (const s of samples) {
    const row = [s.x, s.y, 1];
    const v = valueOf(s);
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 3; j++) A[i][j] += row[i] * row[j];
      B[i] += row[i] * v;
    }
  }
  return solve3(A, B);
}

function solve3(A, B) {
  const m = A.map((row, i) => [...row, B[i]]);
  for (let col = 0; col < 3; col++) {
    let pivot = col;
    for (let r = col + 1; r < 3; r++) if (Math.abs(m[r][col]) > Math.abs(m[pivot][col])) pivot = r;
    [m[col], m[pivot]] = [m[pivot], m[col]];
    if (Math.abs(m[col][col]) < 1e-12) throw new Error("anchors are degenerate");
    for (let r = 0; r < 3; r++) {
      if (r === col) continue;
      const f = m[r][col] / m[col][col];
      for (let c = col; c < 4; c++) m[r][c] -= f * m[col][c];
    }
  }
  return [m[0][3] / m[0][0], m[1][3] / m[1][1], m[2][3] / m[2][2]];
}

const lonOf = fitPlane(anchors, (s) => s.lon);
const latOf = fitPlane(anchors, (s) => s.lat);
const project = ([x, y]) => ({
  lon: lonOf[0] * x + lonOf[1] * y + lonOf[2],
  lat: latOf[0] * x + latOf[1] * y + latOf[2],
});

const metres = (a, b) => {
  const k = Math.cos((a.lat * Math.PI) / 180) * 111320;
  return Math.hypot((a.lon - b.lon) * k, (a.lat - b.lat) * 110540);
};

const residuals = anchors
  .map((a) => metres(a, project([a.x, a.y])))
  .sort((p, q) => p - q);
console.log(
  `fit residuals across the anchors: median ${residuals[residuals.length >> 1].toFixed(1)} m, ` +
    `worst ${residuals.at(-1).toFixed(1)} m`,
);

const centre = (ring) => {
  const pts = ring.map(project);
  return {
    lat: pts.reduce((a, p) => a + p.lat, 0) / pts.length,
    lon: pts.reduce((a, p) => a + p.lon, 0) / pts.length,
  };
};

// The tour writes "St. Clair Hall" where the directory writes "St Clair Hall",
// and repeats some buildings on more than one layer.
const key = (s) => s.toLowerCase().replace(/[^a-z]/g, "");
const outlines = new Map();
for (const s of shapes) if (!outlines.has(key(s.title))) outlines.set(key(s.title), s);

// ─── check the fit against buildings we already know ────────────────────────

const rows = readFileSync(TABLE, "utf8")
  .trim()
  .split("\n")
  .filter((l) => l && !l.startsWith("#"))
  .slice(1)
  .map((l) => {
    const [label, osm, lat, lon] = l.split("\t");
    return { label, osm: osm ?? "", lat: lat ?? "", lon: lon ?? "" };
  });

const osmCentres = new Map();
if (existsSync(OSM)) {
  for (const e of JSON.parse(readFileSync(OSM, "utf8")).elements) {
    if (!e.tags?.building || !e.tags.name) continue;
    const g = e.geometry ?? (e.members ?? []).find((m) => m.role !== "inner" && m.geometry)?.geometry;
    if (!g?.length || osmCentres.has(e.tags.name)) continue;
    osmCentres.set(e.tags.name, {
      lat: g.reduce((a, p) => a + p.lat, 0) / g.length,
      lon: g.reduce((a, p) => a + p.lon, 0) / g.length,
    });
  }
}

const checks = [];
for (const r of rows) {
  const known = r.osm && osmCentres.get(r.osm);
  const drawn = outlines.get(key(r.label)) ?? outlines.get(key(r.osm || ""));
  if (known && drawn) checks.push({ label: r.label, off: metres(known, centre(drawn.ring)) });
}
checks.sort((a, b) => a.off - b.off);
console.log(`\nagainst ${checks.length} buildings OSM already maps:`);
for (const c of checks) console.log(`  ${c.off.toFixed(0).padStart(4)} m  ${c.label}`);
console.log(`  median ${checks[checks.length >> 1].off.toFixed(0)} m, worst ${checks.at(-1).off.toFixed(0)} m`);

// ─── the answers ────────────────────────────────────────────────────────────

const found = {};
console.log("\nhalls OSM is missing:");
for (const r of rows) {
  if (r.osm) continue;
  const drawn = outlines.get(key(r.label));
  if (!drawn) {
    console.log(`  ${r.label.padEnd(16)} not in the tour either`);
    continue;
  }
  const c = centre(drawn.ring);
  found[r.label] = {
    tourTitle: drawn.title,
    ring: drawn.ring.map(project).map((q) => [+q.lat.toFixed(6), +q.lon.toFixed(6)]),
  };
  console.log(
    `  ${r.label.padEnd(16)} ${c.lat.toFixed(6)}, ${c.lon.toFixed(6)}   ` +
      `${drawn.ring.length}-point outline (tour: ${drawn.title})`,
  );
}

if (process.argv.includes("--write")) {
  await Bun.write(OUT, JSON.stringify({ source: SOURCE, fitMedianMetres: +checks[checks.length >> 1].off.toFixed(1), buildings: found }, null, 1));
  console.log(`\nwrote ${Object.keys(found).length} outlines to data/tour-buildings.json`);
} else if (Object.keys(found).length) {
  console.log("\npass --write to save these to data/tour-buildings.json");
}
