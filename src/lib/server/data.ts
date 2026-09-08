// What the server is willing to say, given who is asking.
//
// The whole dossier is the product, so it never leaves the worker unpaid for.
// The gate is the query rather than a filter after the fact: a free account's
// request never selects a dorm, a schedule or a hometown, so there is no path
// by which one could leak. Free gets the roster — names and the faces everyone
// in the GroupMe has already seen — plus their own row in full. Pro gets the
// join and the campus they walk across.

import { eq, inArray, like } from 'drizzle-orm';
import type { DB } from './db';
import { schema } from './db';
import type { Access } from './access';
import type { Campus, Player, Tier } from '$lib/game/types';

const P = schema.player;

// The cheap columns: what a name and a face need, and nothing that costs money.
const CARD = {
	gmId: P.gmId,
	name: P.name,
	matched: P.matched,
	avatar: P.avatar,
	photos: P.photos,
	class: P.class
} as const;

export type RosterCard = {
	gmId: string;
	name: string;
	matched: boolean;
	avatar: Player['avatar'];
	photos: Player['photos'];
	class: string | null;
};

/**
 * Photographs added since the join was built, by player.
 *
 * They live in their own table because `player` is deleted and rewritten every
 * time the join runs, so anything filed during the game would last until the
 * next rebuild and no longer.
 */
async function extras(db: DB, gmIds: string[]) {
	if (!gmIds.length) return new Map<string, Player['photos']>();
	const rows = await db
		.select()
		.from(schema.extraPhoto)
		.where(inArray(schema.extraPhoto.gmId, gmIds));
	const out = new Map<string, Player['photos']>();
	for (const r of rows)
		out.set(r.gmId, [...(out.get(r.gmId) ?? []), { url: r.url, rotate: 0 }]);
	return out;
}

/** Fold those in, so callers get one list and never think about the join. */
async function withExtras(db: DB, players: Player[]) {
	const found = await extras(db, players.map((p) => p.gmId));
	if (!found.size) return players;
	return players.map((p) => (found.has(p.gmId) ? { ...p, extra: found.get(p.gmId) } : p));
}

const rehydrate = (r: typeof P.$inferSelect): Player => ({
	gmId: r.gmId,
	name: r.name,
	avatar: r.avatar ?? null,
	photos: r.photos ?? [],
	gallery: r.gallery ?? [],
	matched: r.matched,
	candidates: r.candidates ?? undefined,
	id: r.studentId ?? undefined,
	username: r.username,
	legalName: r.legalName ?? undefined,
	class: r.class ?? undefined,
	dorm: r.dorm,
	room: r.room,
	gender: r.gender,
	hometown: r.hometown,
	directoryPhoto: r.directoryPhoto ?? null,
	majors: r.majors ?? [],
	schedule: r.schedule ?? []
});

export const roster = (db: DB) => db.select(CARD).from(P).orderBy(P.name) as Promise<RosterCard[]>;

export const everyone = async (db: DB) => {
	// Every extra photo belongs to somebody on the roster, so both halves can be
	// asked for at once rather than one waiting on the other's ids.
	const [rows, extra] = await Promise.all([
		db.select().from(P).orderBy(P.name),
		db.select().from(schema.extraPhoto)
	]);
	const found = new Map<string, Player['photos']>();
	for (const r of extra) found.set(r.gmId, [...(found.get(r.gmId) ?? []), { url: r.url, rotate: 0 }]);
	return rows
		.map(rehydrate)
		.map((p) => (found.has(p.gmId) ? { ...p, extra: found.get(p.gmId) } : p));
};

export async function onePlayer(db: DB, gmId: string) {
	const [row] = await db.select().from(P).where(eq(P.gmId, gmId)).limit(1);
	if (!row) return null;
	return (await withExtras(db, [rehydrate(row)]))[0];
}

export async function somePlayers(db: DB, gmIds: string[]) {
	if (!gmIds.length) return [];
	return withExtras(db, (await db.select().from(P).where(inArray(P.gmId, gmIds))).map(rehydrate));
}

export const exists = async (db: DB, gmId: string) =>
	!!(await db.select({ gmId: P.gmId }).from(P).where(eq(P.gmId, gmId)).limit(1))[0];

async function fact<T>(db: DB, key: string): Promise<T | null> {
	const [row] = await db
		.select()
		.from(schema.dataset)
		.where(eq(schema.dataset.key, key))
		.limit(1);
	return (row?.value as T) ?? null;
}

// Both facts live in the same table, so they cost one round trip, not two.
// On D1 every await is a network hop and they add up faster than they read.
export async function meta(db: DB) {
	const rows = await db
		.select()
		.from(schema.dataset)
		.where(inArray(schema.dataset.key, ['term', 'group']));
	const at = (k: string) => rows.find((r) => r.key === k)?.value;
	return {
		term: (at('term') as string) ?? '',
		group: (at('group') as { id: string; name: string }) ?? { id: '', name: '' }
	};
}

// The campus is stored as its parts, because D1 refuses a statement much past
// 50 KB and the whole graph is twice that. They are separate arrays that only
// ever travel together, so one query puts them back.
export async function campus(db: DB): Promise<Campus | null> {
	const rows = await db
		.select()
		.from(schema.dataset)
		.where(like(schema.dataset.key, 'campus.%'));
	if (!rows.length) return null;
	const parts = Object.fromEntries(rows.map((r) => [r.key.slice('campus.'.length), r.value]));
	return parts as unknown as Campus;
}

// ─── claiming ───────────────────────────────────────────────────────────────

// Ranked guesses at which player an account is, best first. An exact username
// match is not a guess at all, which is the point of carrying the directory's
// Username through the build: for 92 of 99 players the claim form arrives
// already answered, and approving it is a glance rather than an investigation.
export async function suggestFor(db: DB, username: string | null, displayName: string) {
	const rows = await db.select({ ...CARD, username: P.username }).from(P);
	const toks = displayName.toLowerCase().split(/\s+/).filter(Boolean);
	return rows
		.map((p) => {
			let score = username && p.username?.toLowerCase() === username.toLowerCase() ? 100 : 0;
			const hay = p.name.toLowerCase();
			for (const t of toks) if (t.length > 1 && hay.includes(t)) score += 3;
			return { p, score };
		})
		.filter((x) => x.score > 0)
		.sort((a, b) => b.score - a.score)
		.slice(0, 8)
		.map((x) => ({ ...x.p, certain: x.score >= 100 }));
}

// ─── the projection ─────────────────────────────────────────────────────────

export type Projection = {
	term: string;
	tier: Tier;
	players: Player[];
	campus: Campus | null;
	roster: RosterCard[] | null;
};

/**
 * The invented day behind the paywall, and the campus to draw it on.
 *
 * Seeded on the mark so it holds still between reloads — a sample that
 * reshuffles reads as a glitch — but nothing in it is theirs, and the panel
 * says so. Only made when there is actually a mark to be kept out of.
 */
async function sampleFor(db: DB, gmId: string | null) {
	if (!gmId) return { campus: null, sample: null };
	const { loadChain } = await import('./game');
	const { targetOf } = await import('$lib/game/chain');
	const { inventPlayer } = await import('./demo');

	const mark = targetOf(await loadChain(db), gmId);
	if (!mark) return { campus: null, sample: null };

	const [map, real] = await Promise.all([campus(db), onePlayer(db, mark)]);
	if (!map || !real) return { campus: null, sample: null };

	// Their real name and one real photograph — both of which the roster already
	// shows — laid over an invented day. Everything under the name is false and
	// is drawn behind glass; the two true things are the two you already had.
	const sample = inventPlayer(map, `preview:${mark}`);
	sample.name = real.name;
	sample.legalName = real.name;
	sample.photos = real.photos.slice(0, 1);
	sample.avatar = real.photos.length ? null : real.avatar;

	return { campus: map, sample };
}

export async function project(db: DB, access: Access): Promise<Projection> {
	if (access.tier === 'pro') {
		const [{ term }, players, map] = await Promise.all([meta(db), everyone(db), campus(db)]);
		return { term, tier: access.tier, players, campus: map, roster: null };
	}

	const { term } = await meta(db);

	if (access.tier === 'free') {
		// You always get yourself in full. It is your own dossier; the paywall
		// is on everyone else.
		const [cards, own, preview] = await Promise.all([
			roster(db),
			access.gmId ? onePlayer(db, access.gmId) : null,
			sampleFor(db, access.gmId)
		]);
		return {
			term,
			tier: access.tier,
			players: [
				...(own ? [own] : []),
				// Openly invented, and openly not the mark's: the paywall shows the
				// shape of the thing rather than a blank wall.
				...(preview.sample ? [preview.sample] : [])
			],
			// OpenStreetMap, which the front door already serves to anybody.
			campus: preview.campus,
			roster: cards
		};
	}

	// Waiting on approval still needs the roster: you cannot name your target
	// without a list of names, and the names are in the GroupMe anyway.
	if (access.tier === 'pending') {
		// Waiting on a human looks the same as not having paid: the file is
		// sealed either way, so the same frosted preview stands in for it.
		const [cards, preview] = await Promise.all([
			roster(db),
			sampleFor(db, access.gmId)
		]);
		return {
			term,
			tier: access.tier,
			players: preview.sample ? [preview.sample] : [],
			campus: preview.campus,
			roster: cards
		};
	}

	return { term, tier: access.tier, players: [], campus: null, roster: [] };
}

// The pitch. Enough to prove there is something behind the paywall without
// being the thing itself: how many photos, how many sections, not which.
export async function teaser(db: DB, gmId: string) {
	const [r] = await db.select().from(P).where(eq(P.gmId, gmId)).limit(1);
	if (!r) return null;
	return {
		gmId: r.gmId,
		name: r.name,
		shots: [r.avatar, ...(r.photos ?? []), ...(r.gallery ?? []), r.directoryPhoto].filter(Boolean)
		.length,
		sections: r.schedule?.length ?? 0,
		meetings: (r.schedule ?? []).reduce((n, c) => n + (c.meets?.length ?? 0), 0),
		buildings: new Set(
			(r.schedule ?? []).flatMap((c) => c.meets.map((m) => m.building).filter(Boolean))
		).size,
		knowsDorm: !!r.dorm,
		knowsHometown: !!r.hometown,
		knowsMajor: !!r.majors?.length
	};
}

export type Teaser = NonNullable<Awaited<ReturnType<typeof teaser>>>;
