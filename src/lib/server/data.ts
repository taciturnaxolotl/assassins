// What the server is willing to say, given who is asking.
//
// Two answers, not a scale. Whoever runs the game gets the join: schedules,
// rooms, the campus, the directory photograph, everything the build could
// resolve. Everybody else gets the public half — the name, the faces, the year,
// the hall, the likely major — and that is the whole game as it is played:
// who these people are and whether they are still standing.
//
// The gate is the query rather than a filter after the fact, so a player's
// request never selects a schedule and there is no path by which one could
// leak.

import { eq, inArray, like } from 'drizzle-orm';
import type { DB } from './db';
import { schema } from './db';
import type { Access } from './access';
import type { Campus, Player, Tier } from '$lib/game/types';
import { nextClassFrom } from '$lib/game/time';

const P = schema.player;

// The public columns. Faces, because the whole game is recognising somebody.
// Year, hall and likely major, because those are what people say about each
// other out loud anyway. Nothing here is a timetable.
const CARD = {
	gmId: P.gmId,
	name: P.name,
	matched: P.matched,
	avatar: P.avatar,
	photos: P.photos,
	gallery: P.gallery,
	class: P.class,
	dorm: P.dorm,
	majors: P.majors
} as const;

export type RosterCard = {
	gmId: string;
	name: string;
	matched: boolean;
	avatar: Player['avatar'];
	photos: Player['photos'];
	gallery: Player['gallery'];
	class: string | null;
	dorm: string | null;
	majors: Player['majors'];
	extra: Player['photos'];
	next: Player['next'];
};

/**
 * Photographs added since the join was built, by player, each labelled with
 * where it came from.
 *
 * They live in their own table because `player` is deleted and rewritten every
 * time the join runs, so anything filed during the game would last until the
 * next rebuild and no longer. The source becomes the caption: a snipe is a
 * snipe, a death photograph is the kill.
 */
const captionFor = (source: string) =>
	source === 'snipes topic' ? 'snipe' : source === 'kills topic' ? 'the kill' : 'added';

async function extras(db: DB, gmIds: string[]) {
	if (!gmIds.length) return new Map<string, Player['photos']>();
	const rows = await db
		.select()
		.from(schema.extraPhoto)
		.where(inArray(schema.extraPhoto.gmId, gmIds));
	const out = new Map<string, Player['photos']>();
	for (const r of rows)
		out.set(r.gmId, [
			...(out.get(r.gmId) ?? []),
			{ url: r.url, rotate: 0, label: captionFor(r.source) }
		]);
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

/**
 * The public half of everybody: the card columns, the photographs filed during
 * the game, and the one derived fact from the timetable that is public — when
 * their next class is. The schedule itself is read to work that out and then
 * dropped; only `next` leaves the server.
 */
export async function roster(db: DB): Promise<RosterCard[]> {
	const [rows, all] = await Promise.all([
		db.select({ ...CARD, schedule: P.schedule }).from(P).orderBy(P.name),
		db.select().from(schema.extraPhoto)
	]);
	const found = new Map<string, Player['photos']>();
	for (const r of all)
		found.set(r.gmId, [
			...(found.get(r.gmId) ?? []),
			{ url: r.url, rotate: 0, label: captionFor(r.source) }
		]);
	const at = new Date();
	return rows.map(({ schedule, ...card }) => ({
		...(card as RosterCard),
		extra: found.get(card.gmId) ?? [],
		next: nextClassFrom(schedule ?? [], at)
	}));
}

export const everyone = async (db: DB) => {
	// Every extra photo belongs to somebody on the roster, so both halves can be
	// asked for at once rather than one waiting on the other's ids.
	const [rows, extra] = await Promise.all([
		db.select().from(P).orderBy(P.name),
		db.select().from(schema.extraPhoto)
	]);
	const found = new Map<string, Player['photos']>();
	for (const r of extra)
		found.set(r.gmId, [
			...(found.get(r.gmId) ?? []),
			{ url: r.url, rotate: 0, label: captionFor(r.source) }
		]);
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

export async function project(db: DB, access: Access): Promise<Projection> {
	// Whoever runs the game gets the join and the campus to draw it on.
	if (access.isAdmin) {
		const [{ term }, players, map] = await Promise.all([meta(db), everyone(db), campus(db)]);
		return { term, tier: access.tier, players, campus: map, roster: null };
	}

	// Everybody else gets the public half of everybody. There is no longer a
	// reason to send one player their own row in full and everyone else's in
	// outline: the same columns answer for the whole roster.
	const [{ term }, cards] = await Promise.all([meta(db), roster(db)]);
	// The card is the player, as far as anybody but an admin is concerned, so it
	// travels as one. Every page then reads from the same list and renders
	// whatever fields happen to be on it.
	return {
		term,
		tier: access.tier,
		players: cards as unknown as Player[],
		campus: null,
		roster: cards
	};
}

