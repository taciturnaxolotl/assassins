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
import { grantedMarks } from './market';
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

export const everyone = async (db: DB) =>
	(await db.select().from(P).orderBy(P.name)).map(rehydrate);

export async function onePlayer(db: DB, gmId: string) {
	const [row] = await db.select().from(P).where(eq(P.gmId, gmId)).limit(1);
	return row ? rehydrate(row) : null;
}

export async function somePlayers(db: DB, gmIds: string[]) {
	if (!gmIds.length) return [];
	return (await db.select().from(P).where(inArray(P.gmId, gmIds))).map(rehydrate);
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

export const meta = async (db: DB) => ({
	term: (await fact<string>(db, 'term')) ?? '',
	group: (await fact<{ id: string; name: string }>(db, 'group')) ?? { id: '', name: '' }
});

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
	const { term } = await meta(db);

	// Taking a job opens that mark's file for as long as the job is open. This
	// is why access is per-target rather than a flag on the account: a free
	// account with a contract can read one dossier and no others.
	const granted = access.user ? await grantedMarks(db, access.user.id) : [];

	if (access.tier === 'pro') {
		const [players, map] = await Promise.all([everyone(db), campus(db)]);
		return { term, tier: access.tier, players, campus: map, roster: null };
	}

	if (access.tier === 'free') {
		// You always get yourself in full. It is your own dossier; the paywall
		// is on everyone else.
		const [cards, own, hired] = await Promise.all([
			roster(db),
			access.gmId ? onePlayer(db, access.gmId) : null,
			somePlayers(db, granted)
		]);
		return {
			term,
			tier: access.tier,
			players: [...(own ? [own] : []), ...hired.filter((p) => p.gmId !== access.gmId)],
			campus: null,
			roster: cards
		};
	}

	// Waiting on approval still needs the roster: you cannot name your target
	// without a list of names, and the names are in the GroupMe anyway.
	if (access.tier === 'pending') {
		const [cards, hired] = await Promise.all([roster(db), somePlayers(db, granted)]);
		return { term, tier: access.tier, players: hired, campus: null, roster: cards };
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
