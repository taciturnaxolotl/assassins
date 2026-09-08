#!/usr/bin/env bun
// The card that shows up when somebody drops the link in the GroupMe.
//
// Drawn from the campus itself rather than a stock gradient, because the map is
// the product: real building outlines, the real footpath network, and one real
// walk across it. Nothing on it belongs to a player — the route is between two
// arbitrary buildings, and no name, room or schedule appears.
//
//   bun scripts/og-image.mjs        # -> static/og.png
//
// The map goes through rsvg-convert and the text through ImageMagick with the
// font files named outright, because rsvg quietly falls back to a system sans
// no matter what fontconfig is told. Run it when the campus changes, which is
// approximately never.

import * as path from 'path';
import { $ } from 'bun';
import { existsSync } from 'fs';

const ROOT = path.join(import.meta.dir, '..');
const CACHE = path.join(ROOT, 'node_modules/.cache/og-fonts');
const W = 1200;
const H = 630;

const INK = '#f4efe8';
const DIM = '#a89e92';
const FAINT = '#6d645b';
const BLOOD = '#c8402f';
const BG = '#12100e';

// ─── fonts ──────────────────────────────────────────────────────────────────

const FONTS = {
	serif: {
		file: `${CACHE}/instrument-serif.ttf`,
		css: 'https://fonts.googleapis.com/css2?family=Instrument+Serif&display=swap'
	},
	mono: {
		file: `${CACHE}/jetbrains-mono.ttf`,
		css: 'https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400&display=swap'
	}
};

for (const { file, css } of Object.values(FONTS)) {
	if (existsSync(file)) continue;
	// The old-browser user agent is what makes Google serve ttf rather than woff2.
	const sheet = await fetch(css, { headers: { 'user-agent': 'Mozilla/5.0 (X11)' } }).then((r) =>
		r.text()
	);
	const url = sheet.match(/https:\/\/[^)]*\.ttf/)?.[0];
	if (!url) throw new Error(`Could not find a ttf in ${css}`);
	await Bun.write(file, await fetch(url).then((r) => r.arrayBuffer()));
	console.log(`  fetched ${path.basename(file)}`);
}

// ─── the campus ─────────────────────────────────────────────────────────────

const raw = await $`bunx wrangler d1 execute assassins --local --json --command ${
	"SELECT key, value FROM dataset WHERE key LIKE 'campus.%'"
}`
	.cwd(ROOT)
	.quiet()
	.text();

const rows = JSON.parse(raw.slice(raw.indexOf('[')))[0].results;
if (!rows?.length) {
	console.error('No campus in the local database. Run `bun run data` first.');
	process.exit(1);
}
const campus = Object.fromEntries(
	rows.map((r) => [r.key.slice('campus.'.length), JSON.parse(r.value)])
);

// A real walk between two buildings, following the footpaths, so the red line
// is the thing the app actually computes rather than a decorative diagonal.
function walk(from, to) {
	const adj = campus.nodes.map(() => []);
	for (const [a, b, w] of campus.edges) {
		adj[a].push([b, w]);
		adj[b].push([a, w]);
	}
	const dist = new Float64Array(campus.nodes.length).fill(Infinity);
	const prev = new Int32Array(campus.nodes.length).fill(-1);
	const queue = [[0, from]];
	dist[from] = 0;
	while (queue.length) {
		queue.sort((a, b) => a[0] - b[0]);
		const [d, u] = queue.shift();
		if (u === to) break;
		if (d > dist[u]) continue;
		for (const [v, w] of adj[u])
			if (d + w < dist[v]) {
				dist[v] = d + w;
				prev[v] = u;
				queue.push([dist[v], v]);
			}
	}
	const out = [];
	for (let at = to; at !== -1; at = prev[at]) out.unshift(at);
	return out;
}

// Two anchored buildings far enough apart that the walk crosses the frame.
const anchored = Object.values(campus.anchors).map((a) => a.node);
const [a, b] = [anchored[0], anchored[Math.floor(anchored.length / 2)]];
const route = walk(a, b).map((n) => campus.nodes[n].join(',')).join(' ');

const [x0, y0, x1, y1] = campus.box;
// Fill the card with the campus, cropping rather than letterboxing.
const scale = Math.max(W / (x1 - x0), H / (y1 - y0)) * 1.5;
const cx = (x0 + x1) / 2;
const cy = (y0 + y1) / 2;
const view = [cx - W / 2 / scale, cy - H / 2 / scale, W / scale, H / scale];

const network = campus.edges
	.map(([p, q]) => `M${campus.nodes[p].join(' ')}L${campus.nodes[q].join(' ')}`)
	.join('');

const buildings = campus.buildings
	.map(
		(x) =>
			`<polygon points="${x.ring.map((p) => p.join(',')).join(' ')}" fill="${
				x.focus ? '#3c342c' : '#2a2623'
			}" stroke="#4a4139" stroke-width="${0.9 / scale}"/>`
	)
	.join('');

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="${BG}"/>
  <g transform="scale(${W / view[2]}) translate(${-view[0]} ${-view[1]})">
    <path d="${network}" fill="none" stroke="#332e29" stroke-width="${1.1 / scale}"/>
    ${buildings}
    <polyline points="${route}" fill="none" stroke="${BLOOD}" stroke-width="${5 / scale}"
      stroke-linecap="round" stroke-linejoin="round"/>
  </g>
  <!-- The map is texture, not the message, so the type has somewhere to sit. -->
  <rect width="${W}" height="${H}" fill="url(#wash)"/>
  <defs>
    <linearGradient id="wash" x1="0" y1="0" x2="1" y2="0.35">
      <stop offset="0" stop-color="${BG}" stop-opacity="0.94"/>
      <stop offset="0.62" stop-color="${BG}" stop-opacity="0.72"/>
      <stop offset="1" stop-color="${BG}" stop-opacity="0.4"/>
    </linearGradient>
  </defs>
</svg>`;

const tmp = path.join(CACHE, 'og-map.svg');
await Bun.write(tmp, svg);

const out = path.join(ROOT, 'static/og.png');
await $`rsvg-convert -w ${W} -h ${H} -o ${out} ${tmp}`.quiet();

// ─── the wordmark ───────────────────────────────────────────────────────────
//
// Nothing but the name. A card that lists features is a card nobody reads at
// thumbnail size, and every extra line is another thing to go stale.

const run = (args) => {
	const r = Bun.spawnSync(args, { stdout: 'pipe', stderr: 'pipe' });
	if (r.exitCode !== 0) {
		console.error(r.stderr.toString().slice(0, 400));
		process.exit(r.exitCode ?? 1);
	}
};

const SIZE = 132;
const LEFT = 76;

// Measured rather than eyeballed, so the two words sit a real space apart
// whatever the point size becomes.
const width = (text) => {
	const r = Bun.spawnSync([
		'magick', '-font', FONTS.serif.file, '-pointsize', String(SIZE),
		'-format', '%[fx:w]', `label:${text}`, 'info:'
	]);
	return Number(r.stdout.toString().trim());
};

run([
	'magick', out,
	'-font', FONTS.serif.file, '-pointsize', String(SIZE),
	'-fill', INK, '-annotate', `+${LEFT}+368`, 'Assassins',
	'-fill', BLOOD, '-annotate', `+${LEFT + width('Assassins ')}+368`, '26',
	out
]);

console.log(`static/og.png  ${(Bun.file(out).size / 1024) | 0} KB`);
