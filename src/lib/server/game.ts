// Reading and writing the ring.
//
// Every player reports their own edge, so the chain assembles itself out of
// ninety-nine private facts instead of being kept by one person by hand. The
// rules are small enough to state here: you may set your own assignment, and
// you may claim a kill you made or admit to being killed. Everything else is
// the admin's.

import { and, eq } from 'drizzle-orm';
import type { DB } from './db';
import { schema } from './db';
import type { Chain, ChainView } from '$lib/game/types';
import { hasWon, targetOf } from '$lib/game/chain';
import { exists } from './data';

// Only confirmed kills take somebody out of the ring. A claim is just a claim
// until whoever runs the game agrees with it — otherwise anybody could report a
// kill and inherit a target by saying so.
export async function loadChain(db: DB): Promise<Chain> {
	const [assigns, kills] = await Promise.all([
		db.select().from(schema.assignment),
		db.select().from(schema.kill).where(eq(schema.kill.confirmed, true))
	]);
	return {
		assigned: Object.fromEntries(assigns.map((a) => [a.hunterGmId, a.victimGmId])),
		kills: Object.fromEntries(kills.map((k) => [k.victimGmId, k.killerGmId ?? '']))
	};
}


const real = async (db: DB, gmId: string) => {
	if (!(await exists(db, gmId))) throw new Error(`No such player: ${gmId}`);
};

export async function setAssignment(
	db: DB,
	hunterGmId: string,
	victimGmId: string | null,
	userId: string
) {
	await real(db, hunterGmId);
	if (!victimGmId) {
		await db.delete(schema.assignment).where(eq(schema.assignment.hunterGmId, hunterGmId));
		return;
	}
	await real(db, victimGmId);
	if (victimGmId === hunterGmId) throw new Error('You cannot draw yourself.');
	await db
		.insert(schema.assignment)
		.values({ hunterGmId, victimGmId, reportedBy: userId, createdAt: new Date() })
		.onConflictDoUpdate({
			target: schema.assignment.hunterGmId,
			set: { victimGmId, reportedBy: userId }
		});
}

export async function setKill(
	db: DB,
	victimGmId: string,
	killerGmId: string | null,
	userId: string,
	confirmed = false
) {
	await real(db, victimGmId);
	if (killerGmId) await real(db, killerGmId);
	if (killerGmId === victimGmId) throw new Error('Nobody takes themselves out.');

	// One row per victim, so a second claim would quietly overwrite the first.
	// Whoever runs the game may do that deliberately; nobody else may take a
	// claim off somebody by making their own.
	const existing = await killRow(db, victimGmId);
	if (existing && !confirmed && existing.killerGmId !== killerGmId)
		throw new Error('Somebody else has already reported this one.');

	await db
		.insert(schema.kill)
		.values({ victimGmId, killerGmId, reportedBy: userId, confirmed, createdAt: new Date() })
		.onConflictDoUpdate({
			target: schema.kill.victimGmId,
			set: { killerGmId, reportedBy: userId, confirmed }
		});
}

/** The raw row, confirmed or not — `loadChain` only ever shows confirmed ones. */
export async function killRow(db: DB, victimGmId: string) {
	const [row] = await db
		.select()
		.from(schema.kill)
		.where(eq(schema.kill.victimGmId, victimGmId))
		.limit(1);
	return row ?? null;
}

/**
 * What a given account may be told about the ring.
 *
 * Deaths and defections are public — everybody watches people drop out. The
 * assignment edges are not, so the walk is done here and only its answer
 * travels. Whoever runs the game gets the real thing.
 */
export async function chainFor(
	db: DB,
	me: string | null,
	isAdmin: boolean
): Promise<ChainView> {
	const [chain, claimed] = await Promise.all([loadChain(db), claimedKill(db, me)]);
	const myTarget = me ? targetOf(chain, me) : null;
	const won = !!me && hasWon(chain, me);

	if (isAdmin) return { ...chain, myTarget, claimedKill: claimed, won, full: true };

	return {
		// Your own edge and nobody else's. The rest of the ring never leaves.
		assigned: me && chain.assigned[me] ? { [me]: chain.assigned[me] } : {},
		kills: chain.kills,
		myTarget,
		claimedKill: claimed,
		won,
		full: false
	};
}

/** A kill this account has reported that nobody has confirmed yet. */
export async function claimedKill(db: DB, gmId: string | null) {
	if (!gmId) return null;
	const [row] = await db
		.select({ victimGmId: schema.kill.victimGmId })
		.from(schema.kill)
		.where(and(eq(schema.kill.killerGmId, gmId), eq(schema.kill.confirmed, false)))
		.limit(1);
	return row?.victimGmId ?? null;
}

/** Everything waiting on somebody to agree it happened. */
export const pendingKills = (db: DB) =>
	db.select().from(schema.kill).where(eq(schema.kill.confirmed, false));

export const confirmKill = (db: DB, victimGmId: string) =>
	db
		.update(schema.kill)
		.set({ confirmed: true })
		.where(eq(schema.kill.victimGmId, victimGmId));

export const clearKill = (db: DB, victimGmId: string) =>
	db.delete(schema.kill).where(eq(schema.kill.victimGmId, victimGmId));

// ─── private notes ──────────────────────────────────────────────────────────

export async function loadNotes(db: DB, userId: string) {
	const rows = await db.select().from(schema.note).where(eq(schema.note.userId, userId));
	return Object.fromEntries(rows.map((n) => [n.gmId, n.body]));
}

export async function setNote(db: DB, userId: string, gmId: string, body: string) {
	if (!body.trim()) {
		await db
			.delete(schema.note)
			.where(and(eq(schema.note.userId, userId), eq(schema.note.gmId, gmId)));
		return;
	}
	await db
		.insert(schema.note)
		.values({ userId, gmId, body, updatedAt: new Date() })
		.onConflictDoUpdate({
			target: [schema.note.userId, schema.note.gmId],
			set: { body, updatedAt: new Date() }
		});
}
