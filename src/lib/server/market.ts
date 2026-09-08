// The board.
//
// Anyone hunting somebody may put something up for having them taken out.
// Anyone at all may bid — players in the ring and free agents from outside it
// alike. Taking a job opens that one mark's file for as long as the job is
// open, which is the second way into a dossier and the reason access is
// per-target rather than a flag on the account.
//
// Nothing is priced. What changes hands is a thing, described in words, and
// escrow is a person holding it rather than an account holding a balance.
//
// The poster is anonymous, and that is a correctness rule rather than a nicety:
// a contract names its mark, so knowing who posted it would tell you who is
// hunting them, and the ring is meant to be private. The poster's identity is
// stripped in `board()` and never leaves the worker.

import { and, desc, eq, inArray } from 'drizzle-orm';
import type { DB } from './db';
import { schema } from './db';
import { loadChain } from './game';
import { targetOf } from '$lib/game/chain';
import { exists } from './data';

const id = () => crypto.randomUUID();

// ─── posting ────────────────────────────────────────────────────────────────

export async function postContract(
	db: DB,
	poster: { userId: string; gmId: string },
	spec: { offer: string; heldBy: string | null; terms: string | null }
) {
	const chain = await loadChain(db);
	const mark = targetOf(chain, poster.gmId);
	if (!mark) throw new Error('You are not hunting anybody to put a price on.');

	const open = await db
		.select()
		.from(schema.contract)
		.where(
			and(
				eq(schema.contract.posterUserId, poster.userId),
				inArray(schema.contract.status, ['open', 'taken'])
			)
		);
	if (open.length) throw new Error('You already have a contract running.');

	const offer = spec.offer?.trim().slice(0, 160);
	if (!offer) throw new Error('Say what you are putting up.');

	await db.insert(schema.contract).values({
		id: id(),
		markGmId: mark,
		posterUserId: poster.userId,
		posterGmId: poster.gmId,
		offer,
		heldBy: spec.heldBy?.trim().slice(0, 80) || null,
		terms: spec.terms?.trim().slice(0, 400) || null,
		status: 'open',
		createdAt: new Date()
	});
}

export async function cancelContract(db: DB, contractId: string, userId: string) {
	const c = await one(db, contractId);
	if (c.posterUserId !== userId) throw new Error('Not your contract.');
	if (c.status === 'taken') throw new Error('Somebody has already picked this up.');
	await db.delete(schema.contract).where(eq(schema.contract.id, contractId));
}

// ─── bidding ────────────────────────────────────────────────────────────────

export async function placeBid(
	db: DB,
	contractId: string,
	hitman: { userId: string; gmId: string | null },
	spec: { ask: string; pitch: string | null }
) {
	const c = await one(db, contractId);
	if (c.status !== 'open') throw new Error('That job is not open.');
	if (c.posterUserId === hitman.userId) throw new Error('You posted this one.');
	// A free agent has no gmId and so can never be the mark.
	if (hitman.gmId && c.markGmId === hitman.gmId)
		throw new Error('You cannot take a job on yourself.');

	const ask = spec.ask?.trim().slice(0, 160);
	if (!ask) throw new Error('Say what you want for it.');
	const pitch = spec.pitch?.trim().slice(0, 300) || null;

	await db
		.insert(schema.bid)
		.values({
			contractId,
			hitmanUserId: hitman.userId,
			hitmanGmId: hitman.gmId,
			ask,
			pitch,
			createdAt: new Date()
		})
		.onConflictDoUpdate({
			target: [schema.bid.contractId, schema.bid.hitmanUserId],
			set: { ask, pitch }
		});
}

export const withdrawBid = (db: DB, contractId: string, userId: string) =>
	db
		.delete(schema.bid)
		.where(and(eq(schema.bid.contractId, contractId), eq(schema.bid.hitmanUserId, userId)));

export async function acceptBid(
	db: DB,
	contractId: string,
	hitmanUserId: string,
	posterUserId: string
) {
	const c = await one(db, contractId);
	if (c.posterUserId !== posterUserId) throw new Error('Not your contract.');
	if (c.status !== 'open') throw new Error('That job is not open.');

	const [chosen] = await db
		.select()
		.from(schema.bid)
		.where(and(eq(schema.bid.contractId, contractId), eq(schema.bid.hitmanUserId, hitmanUserId)))
		.limit(1);
	if (!chosen) throw new Error('No such bid.');

	await db
		.update(schema.contract)
		.set({
			status: 'taken',
			// What was shaken on, which is the hitman's asking terms rather than
			// whatever was first put up.
			agreed: chosen.ask,
			takenByUserId: chosen.hitmanUserId,
			takenByGmId: chosen.hitmanGmId,
			takenAt: new Date()
		})
		.where(eq(schema.contract.id, contractId));

	// The losing bids have nothing left to say.
	await db.delete(schema.bid).where(eq(schema.bid.contractId, contractId));
}

/** Both sides have to say the goods changed hands, so neither closes it alone. */
export async function settle(db: DB, contractId: string, userId: string) {
	const c = await one(db, contractId);
	if (c.status !== 'taken') throw new Error('Nothing to settle.');

	const side =
		c.posterUserId === userId
			? { posterSettled: true }
			: c.takenByUserId === userId
				? { hitmanSettled: true }
				: null;
	if (!side) throw new Error('Not yours to settle.');

	const next = { ...c, ...side };
	const done = next.posterSettled && next.hitmanSettled;
	await db
		.update(schema.contract)
		.set({ ...side, ...(done ? { status: 'done', closedAt: new Date() } : {}) })
		.where(eq(schema.contract.id, contractId));
}

// ─── reading ────────────────────────────────────────────────────────────────

async function one(db: DB, contractId: string) {
	const [c] = await db
		.select()
		.from(schema.contract)
		.where(eq(schema.contract.id, contractId))
		.limit(1);
	if (!c) throw new Error('No such contract.');
	return c;
}

/** The marks whose files this account has bought its way into by taking a job. */
export async function grantedMarks(db: DB, userId: string) {
	const rows = await db
		.select({ markGmId: schema.contract.markGmId })
		.from(schema.contract)
		.where(and(eq(schema.contract.takenByUserId, userId), eq(schema.contract.status, 'taken')));
	return [...new Set(rows.map((r) => r.markGmId))];
}

export type BoardEntry = Awaited<ReturnType<typeof board>>[number];

/**
 * The board as one account may see it. Every row is stripped of who posted it;
 * `mine` is the only hint, and it is only ever true for the reader themselves.
 */
export async function board(db: DB, me: { userId: string; gmId: string | null }) {
	const rows = await db
		.select()
		.from(schema.contract)
		.where(inArray(schema.contract.status, ['open', 'taken']))
		.orderBy(desc(schema.contract.createdAt));

	const ids = rows.map((r) => r.id);
	const bids = ids.length
		? await db
				.select({ bid: schema.bid, hitmanName: schema.user.name })
				.from(schema.bid)
				.innerJoin(schema.user, eq(schema.user.id, schema.bid.hitmanUserId))
				.where(inArray(schema.bid.contractId, ids))
		: [];
	const takenNames = new Map(
		rows.filter((r) => r.takenByUserId).length
			? (
					await db
						.select({ id: schema.user.id, name: schema.user.name })
						.from(schema.user)
						.where(
							inArray(
								schema.user.id,
								rows.map((r) => r.takenByUserId).filter((x): x is string => !!x)
							)
						)
				).map((u) => [u.id, u.name] as const)
			: []
	);

	return rows.map((c) => {
		const mine = c.posterUserId === me.userId;
		const taken = c.takenByUserId === me.userId;
		const forMe = bids.filter((b) => b.bid.contractId === c.id);
		return {
			id: c.id,
			markGmId: c.markGmId,
			offer: c.offer,
			agreed: c.agreed,
			heldBy: c.heldBy,
			terms: c.terms,
			status: c.status,
			createdAt: c.createdAt,
			mine,
			taken,
			// You are the mark. Told plainly, because it is more fun than hiding it
			// and the poster stays anonymous either way.
			onMe: !!me.gmId && c.markGmId === me.gmId,
			// The poster picks from named bids; nobody else learns who bid at all.
			bids: mine
				? forMe.map((b) => ({
						hitmanUserId: b.bid.hitmanUserId,
						hitmanGmId: b.bid.hitmanGmId,
						// A free agent is nobody on the roster, so they answer to
						// whatever their account is called.
						hitmanName: b.bid.hitmanGmId ? null : b.hitmanName,
						ask: b.bid.ask,
						pitch: b.bid.pitch
					}))
				: [],
			bidCount: forMe.length,
			// The poster hired them off a named bid, so they already know. Nobody
			// else is told who is working which job.
			takenByGmId: mine ? c.takenByGmId : null,
			takenByName:
				mine && !c.takenByGmId && c.takenByUserId
					? (takenNames.get(c.takenByUserId) ?? 'a free agent')
					: null,
			myBid: forMe.find((b) => b.bid.hitmanUserId === me.userId)
				? { ask: forMe.find((b) => b.bid.hitmanUserId === me.userId)!.bid.ask }
				: null,
			// Only the two of them, and only once it is theirs.
			settledByMe: mine ? c.posterSettled : taken ? c.hitmanSettled : false,
			settledByThem: mine ? c.hitmanSettled : taken ? c.posterSettled : false
		};
	});
}
