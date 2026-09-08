#!/usr/bin/env bun
// Fingerprint every photo so the same one is not shown twice.
//
// People post their profile picture as their reference photo, or a crop of it,
// which arrives as a different upload with a different hash and a different
// aspect ratio. Nothing about the URLs can tell. Nor can a perceptual hash of
// the frame: a crop moves too much of it (measured, a known-duplicate pair
// scored 20 bits apart on a dHash, which is well into "different").
//
// A colour histogram gets closer, because a crop keeps the palette. It is not
// enough on its own. Measured on this roster:
//
//   identical file, re-uploaded            1.000
//   the same photo, cropped                0.974 - 0.978
//   two frames from one photoshoot         0.974   <- not a duplicate
//   a Monster can and a cat meme, both dark 0.956  <- not a duplicate
//   two people                             0.573
//
// A real duplicate and a photoshoot pair land on the same number, so no
// threshold separates them. Only an identical histogram is safe to act on
// alone; everything between is printed here for somebody to look at and settle
// in data/photo-dupes.tsv, the same way names are settled in overrides.tsv.
//
//   bun run photos:hash        # fills the cache, then proposes near matches
//
// Needs ImageMagick (`brew install imagemagick`). The build reads the cache if
// it is there and does not care if it is not, so this stays optional and the
// build stays offline.

import * as path from 'path';
import { existsSync, readFileSync } from 'fs';
import { $ } from 'bun';

const ROOT = path.join(import.meta.dir, '..');
const CACHE = path.join(ROOT, 'data/photo-hashes.tsv');

// Comment lines carry the reasoning in these files, same as the build's reader.
const tsv = (file) => {
	if (!existsSync(file)) return [];
	const lines = readFileSync(file, 'utf8')
		.trim()
		.split('\n')
		.filter((l) => l && !l.startsWith('#'));
	const cols = lines[0].split('\t');
	return lines.slice(1).map((r) => Object.fromEntries(r.split('\t').map((v, i) => [cols[i], v])));
};

// Same expansion the build uses: the roster stores GroupMe's compact form.
const url = (s) =>
	!s ? null
	: /^https?:\/\//.test(s) ? s
	: s.startsWith('U') ? `https://m.groupme.com/uploads/${s.slice(1)}`
	: `https://i.groupme.com/${s.replace(/^I/, '')}`;

const wanted = new Set();
for (const r of tsv(path.join(ROOT, 'data/groupme-roster.tsv'))) {
	const u = url(r.image);
	if (u) wanted.add(u);
}
for (const r of tsv(path.join(ROOT, 'data/reference-photos.tsv'))) {
	const u = url(r.url);
	if (u) wanted.add(u);
}
for (const r of tsv(path.join(ROOT, 'data/profile-photos.tsv'))) {
	if (/^https?:\/\//.test(r.url)) wanted.add(r.url);
}

const known = new Map(tsv(CACHE).map((r) => [r.url, r.hist]));
const todo = [...wanted].filter((u) => !known.has(u));
console.log(`${wanted.size} photos, ${known.size} already fingerprinted, ${todo.length} to do`);

if (todo.length) {
	try {
		await $`magick -version`.quiet();
	} catch {
		console.error('Needs ImageMagick: brew install imagemagick');
		process.exit(1);
	}
}

/** 8x8x8 RGB histogram, one byte a bin, hex. Crop-tolerant by construction. */
async function fingerprint(u) {
	const res = await fetch(u, { headers: { 'user-agent': 'Mozilla/5.0' } });
	if (!res.ok) return null;
	const jpeg = Buffer.from(await res.arrayBuffer());
	// Bun's shell takes a Buffer as a redirect, not as a .stdin() call.
	const { stdout: rgb } =
		await $`magick - -colorspace sRGB -resize 32x32! -depth 8 rgb:- < ${jpeg}`.quiet();

	const bins = new Float64Array(512);
	for (let i = 0; i + 2 < rgb.length; i += 3)
		bins[(rgb[i] >> 5) * 64 + (rgb[i + 1] >> 5) * 8 + (rgb[i + 2] >> 5)]++;

	const px = rgb.length / 3;
	// Scaled so the busiest bin is 255; cosine does not care about the scale.
	const peak = Math.max(...bins) || 1;
	return [...bins].map((v) => Math.round((v / peak) * 255).toString(16).padStart(2, '0')).join('');
}

let done = 0;
let failed = 0;
for (const u of todo) {
	try {
		const h = await fingerprint(u);
		if (h) known.set(u, h);
		else failed++;
	} catch {
		failed++;
	}
	process.stdout.write(`\r  ${++done}/${todo.length}${failed ? `  ${failed} unreadable` : ''}`);
}

if (todo.length) {
	const out = ['url\thist', ...[...known].map(([u, h]) => `${u}\t${h}`)];
	await Bun.write(CACHE, out.join('\n') + '\n');
	console.log(`\n${known.size} fingerprints -> data/photo-hashes.tsv`);
}

// ─── propose ────────────────────────────────────────────────────────────────

const bins = (hex) => {
	const b = new Float64Array(512);
	for (let i = 0; i < 512; i++) b[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
	return b;
};
const cosine = (a, b) => {
	let dot = 0, x = 0, y = 0;
	for (let i = 0; i < 512; i++) {
		dot += a[i] * b[i];
		x += a[i] * a[i];
		y += b[i] * b[i];
	}
	return x && y ? dot / Math.sqrt(x * y) : 0;
};

// Only pairs belonging to the same player are worth proposing; two strangers
// with a similar palette are not a duplicate of anything.
const owner = new Map();
const claim = (id, u) => u && owner.set(u, id);
for (const r of tsv(path.join(ROOT, 'data/groupme-roster.tsv'))) claim(r.user_id, url(r.image));
for (const r of tsv(path.join(ROOT, 'data/reference-photos.tsv'))) claim(r.user_id, url(r.url));
for (const r of tsv(path.join(ROOT, 'data/profile-photos.tsv'))) claim(r.user_id, r.url);

const names = new Map(
	tsv(path.join(ROOT, 'data/groupme-roster.tsv')).map((r) => [r.user_id, r.nickname])
);
// Both verdicts settle a photo: `drop` acts on it, `keep` records that somebody
// already looked and said no, so it is not proposed again every run.
const settled = new Set(tsv(path.join(ROOT, 'data/photo-dupes.tsv')).map((r) => r.url));

const byOwner = new Map();
for (const [u, h] of known) {
	const id = owner.get(u);
	if (!id || settled.has(u)) continue;
	if (!byOwner.has(id)) byOwner.set(id, []);
	byOwner.get(id).push([u, bins(h)]);
}

const proposals = [];
for (const [id, shots] of byOwner)
	for (let i = 0; i < shots.length; i++)
		for (let j = i + 1; j < shots.length; j++) {
			const c = cosine(shots[i][1], shots[j][1]);
			if (c >= 0.95 && c < 0.999) proposals.push([c, names.get(id) ?? id, shots[i][0], shots[j][0]]);
		}

if (proposals.length) {
	console.log(`\n${proposals.length} pairs may be the same photo. Look at them:\n`);
	for (const [c, who, a, b] of proposals.sort((x, y) => y[0] - x[0]))
		console.log(`  ${c.toFixed(3)}  ${who}\n    ${a}\n    ${b}`);
	console.log('\nPut the one to drop in data/photo-dupes.tsv, with a reason.');
} else {
	console.log('No new near matches to look at.');
}
console.log('\nNow run: bun run data');
