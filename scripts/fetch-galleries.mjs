#!/usr/bin/env bun
// The gallery GroupMe shows when you tap somebody's profile.
//
// Up to six photos they chose to publish, which is better reference material
// than one avatar and costs them nothing to set up. GroupMe's own docs cover
// writing your own `photo_urls` and not reading anybody else's; the endpoint
// below is the one the web client actually calls, found by watching it.
//
//   GROUPME_TOKEN=... bun scripts/fetch-galleries.mjs
//
// The token is `access_token` in web.groupme.com's localStorage, or yours from
// dev.groupme.com. Writes data/profile-photos.tsv, which `bun run data` picks
// up if it is there. The same response also carries `bio` and `interests`,
// which nothing reads yet.

import * as path from 'path';
import { readFileSync } from 'fs';

const ROOT = path.join(import.meta.dir, '..');
const TOKEN = process.env.GROUPME_TOKEN;
if (!TOKEN) {
	console.error('Set GROUPME_TOKEN. Get one from https://dev.groupme.com.');
	process.exit(1);
}

const tsv = (file) => {
	const [head, ...rows] = readFileSync(file, 'utf8').trim().split('\n');
	const cols = head.split('\t');
	return rows.map((r) => Object.fromEntries(r.split('\t').map((v, i) => [cols[i], v])));
};

const roster = tsv(path.join(ROOT, 'data/groupme-roster.tsv'));

// v3 answers 500 for another user; v2 answers with the whole profile.
const profile = async (id) => {
	const res = await fetch(`https://v2.groupme.com/users/${id}`, {
		headers: { 'X-Access-Token': TOKEN, accept: 'application/json' }
	});
	if (!res.ok) return null;
	const body = await res.json().catch(() => null);
	return body?.response?.user ?? null;
};

const photos = ['user_id\turl'];
let withGallery = 0;

for (const [i, r] of roster.entries()) {
	const user = await profile(r.user_id);
	// One client uploads a `content://` path from its own crop cache.
	const urls = (user?.photo_urls ?? []).filter(
		(u) => typeof u === 'string' && u.startsWith('http')
	);
	if (urls.length) withGallery++;
	for (const url of urls) photos.push(`${r.user_id}\t${url}`);


	process.stdout.write(`\r  ${i + 1}/${roster.length}  ${withGallery} with galleries`);
	await new Promise((f) => setTimeout(f, 120)); // be a good guest
}

await Bun.write(path.join(ROOT, 'data/profile-photos.tsv'), photos.join('\n') + '\n');
console.log(
	`\n${photos.length - 1} photos from ${withGallery} profiles -> data/profile-photos.tsv\n` +
		'Now run: bun run data'
);
