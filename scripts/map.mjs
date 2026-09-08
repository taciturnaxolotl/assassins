// Turn the cached OpenStreetMap extract into something the app can draw and
// route on: building outlines in metres, and a walking graph of every footpath,
// stair and service drive on campus.

import { readFileSync } from "fs";

// Ways you can actually walk, and how much you mind walking them. A footpath is
// the baseline; roads cost more so a route only uses them when there is no path.
const WALKABLE = {
  footway: 1,
  path: 1,
  pedestrian: 1,
  steps: 1.4,
  cycleway: 1.1,
  service: 1.2,
  track: 1.3,
  living_street: 1.2,
  residential: 1.3,
  unclassified: 1.4,
  tertiary: 1.8,
  secondary: 2.2,
  primary: 2.6,
};

const round = (n) => Math.round(n * 10) / 10;

// `labels` maps a catalog or directory name to the name OSM uses. `extra` holds
// outlines for the buildings OSM has never mapped, already in lat/lon.
export function buildMap(osmPath, labels, extra = {}) {
  const osm = JSON.parse(readFileSync(osmPath, "utf8"));

  // Flat-earth projection about the middle of the extract. Over a campus the
  // error is centimetres, and metres beat degrees for everything downstream.
  const pts = osm.elements.flatMap((e) => e.geometry ?? []);
  const lat0 = pts.reduce((a, p) => a + p.lat, 0) / pts.length;
  const lon0 = pts.reduce((a, p) => a + p.lon, 0) / pts.length;
  const project = (p) => [
    round((p.lon - lon0) * 111320 * Math.cos((lat0 * Math.PI) / 180)),
    round((lat0 - p.lat) * 110540), // y grows downward, the way SVG likes it
  ];

  // ─── buildings ────────────────────────────────────────────────────────────

  const byName = new Map();
  const buildings = [];
  for (const e of osm.elements) {
    if (!e.tags?.building) continue;
    // A simple building is one closed way; a complicated one is a multipolygon
    // relation, and its outer members are the outlines we want.
    const rings = e.geometry
      ? [e.geometry]
      : (e.members ?? []).filter((m) => m.role !== "inner" && m.geometry).map((m) => m.geometry);
    for (const g of rings) {
      const b = { name: e.tags.name ?? null, ring: g.map(project) };
      buildings.push(b);
      if (b.name && !byName.has(b.name)) byName.set(b.name, b);
    }
  }

  // ─── walking graph ────────────────────────────────────────────────────────

  const index = new Map(); // osm node id -> our node index
  const nodes = [];
  const adj = new Map();
  const nodeAt = (id, p) => {
    if (!index.has(id)) {
      index.set(id, nodes.length);
      nodes.push(project(p));
    }
    return index.get(id);
  };
  const link = (a, b, w) => {
    for (const [x, y] of [[a, b], [b, a]]) {
      if (!adj.has(x)) adj.set(x, new Map());
      const seen = adj.get(x).get(y);
      if (seen == null || w < seen) adj.get(x).set(y, w);
    }
  };

  for (const e of osm.elements) {
    const cost = WALKABLE[e.tags?.highway];
    if (!cost || !e.geometry || !e.nodes) continue;
    for (let i = 1; i < e.nodes.length; i++) {
      const a = nodeAt(e.nodes[i - 1], e.geometry[i - 1]);
      const b = nodeAt(e.nodes[i], e.geometry[i]);
      if (a === b) continue;
      const [ax, ay] = nodes[a];
      const [bx, by] = nodes[b];
      link(a, b, Math.hypot(bx - ax, by - ay) * cost);
    }
  }

  // A route can only exist inside one connected component, so keep the big one
  // and drop the stray fragments that would silently break routing.
  const main = largestComponent(nodes.length, adj);
  const renumber = new Map([...main].sort((a, b) => a - b).map((old, i) => [old, i]));
  const keptNodes = [...renumber.keys()].map((old) => nodes[old]);
  const edges = [];
  for (const [a, ns] of adj) {
    if (!renumber.has(a)) continue;
    for (const [b, w] of ns) {
      if (a < b && renumber.has(b)) edges.push([renumber.get(a), renumber.get(b), Math.round(w)]);
    }
  }

  // ─── anchors ──────────────────────────────────────────────────────────────

  // Where you stand when you arrive: the graph node closest to the building's
  // outline, which is a door often enough and never far from one.
  const anchors = {};
  const missing = [];
  const focus = new Set();
  for (const { label, osm: name } of labels) {
    let ring = null;
    if (name && byName.has(name)) {
      ring = byName.get(name).ring;
      focus.add(name);
    } else if (extra[label]) {
      // Not in OSM, so draw it from the campus tour as well as anchor to it.
      ring = extra[label].ring.map(([lat, lon]) => project({ lat, lon }));
      buildings.push({ name: label, ring, fromTour: true });
      focus.add(label);
    }
    if (!ring) {
      missing.push(label);
      continue;
    }
    let best = -1;
    let bestD = Infinity;
    for (let i = 0; i < keptNodes.length; i++) {
      const [x, y] = keptNodes[i];
      for (const [rx, ry] of ring) {
        const d = (rx - x) ** 2 + (ry - y) ** 2;
        if (d < bestD) [bestD, best] = [d, i];
      }
    }
    anchors[label] = { node: best, name: name ?? label };
  }

  // ─── crop ─────────────────────────────────────────────────────────────────

  // Keep the walkable neighbourhood of the places people actually go.
  const anchored = Object.values(anchors).map((a) => keptNodes[a.node]);
  const pad = 130;
  const box = [
    Math.min(...anchored.map((p) => p[0])) - pad,
    Math.min(...anchored.map((p) => p[1])) - pad,
    Math.max(...anchored.map((p) => p[0])) + pad,
    Math.max(...anchored.map((p) => p[1])) + pad,
  ];
  const inside = ([x, y]) => x >= box[0] && x <= box[2] && y >= box[1] && y <= box[3];

  return {
    origin: { lat: lat0, lon: lon0 },
    box: box.map(Math.round),
    // OpenStreetMap carries some buildings twice — a way and a relation over
    // the same footprint, or a building:part traced on top of its building.
    // Faith Hall arrives that way. Identical outline means identical building,
    // so it is drawn and labelled once.
    buildings: dedupe(buildings.filter((b) => b.ring.some(inside))).map((b) => ({
      name: b.name,
      ring: b.ring,
      focus: b.name ? focus.has(b.name) : false,
    })),
    nodes: keptNodes,
    edges,
    anchors,
    missing,
  };
}

function dedupe(buildings) {
  const seen = new Map();
  for (const b of buildings) {
    const key = b.ring.map((p) => p.join(",")).join(" ");
    // Keep whichever copy has a name, since one of the pair often does not.
    if (!seen.has(key) || (!seen.get(key).name && b.name)) seen.set(key, b);
  }
  return [...seen.values()];
}

function largestComponent(count, adj) {
  const seen = new Uint8Array(count);
  let best = new Set();
  for (let start = 0; start < count; start++) {
    if (seen[start] || !adj.has(start)) continue;
    const comp = new Set([start]);
    const queue = [start];
    seen[start] = 1;
    while (queue.length) {
      for (const n of adj.get(queue.pop())?.keys() ?? []) {
        if (seen[n]) continue;
        seen[n] = 1;
        comp.add(n);
        queue.push(n);
      }
    }
    if (comp.size > best.size) best = comp;
  }
  return best;
}
