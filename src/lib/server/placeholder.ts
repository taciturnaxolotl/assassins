// Standing in for a player who has not signed in yet.
//
// Impersonating somebody needs an account to wear, and most of the roster has
// never opened the app. Rather than synthesise a read-only ghost — which could
// look at things but never do any of them — this makes the real account they
// would have had, already approved as themselves. It behaves exactly like a
// player because it is one.
//
// The row is adopted when the real person finally signs in: their Cedarville
// username is what the directory matched to this player in the first place, so
// it is also what identifies the seat they are meant to take.

import { eq } from 'drizzle-orm';
import type { DB } from './db';
import { schema } from './db';
import { onePlayer } from './data';

/** A placeholder is any account nobody has actually signed into. */
export const PLACEHOLDER = 'placeholder:';
export const isPlaceholder = (googleSub: string) => googleSub.startsWith(PLACEHOLDER);

/**
 * The account for a roster player, made if it is not there. Returns its id.
 */
export async function accountFor(db: DB, gmId: string) {
	const [existing] = await db
		.select({ userId: schema.claim.userId })
		.from(schema.claim)
		.where(eq(schema.claim.gmId, gmId))
		.limit(1);
	if (existing) return existing.userId;

	const player = await onePlayer(db, gmId);
	if (!player) throw new Error('No such player.');

	const id = crypto.randomUUID();
	const now = new Date();
	// The address they will actually sign in with, when we know it. Otherwise
	// something unroutable, so a placeholder can never be mailed by accident.
	const email = player.username
		? `${player.username}@cedarville.edu`
		: `player-${gmId}@placeholder.invalid`;

	await db.insert(schema.user).values({
		id,
		googleSub: PLACEHOLDER + gmId,
		name: player.name,
		email,
		image: null,
		username: player.username ?? null,
		role: 'player',
		plan: 'free',
		createdAt: now,
		updatedAt: now
	});

	// Approved, because the directory already said who they are — the same
	// reasoning that auto-approves a directory match at the claim form.
	await db.insert(schema.claim).values({
		userId: id,
		gmId,
		status: 'approved',
		verdict: 'Seat held before they signed in.',
		createdAt: now
	});

	return id;
}

/**
 * The seat waiting for somebody about to sign in, if there is one.
 *
 * Matched on the Cedarville username, which is what put them on this player in
 * the first place. Without this they would get a second account and the seat
 * would sit there holding their claim.
 */
export async function seatFor(db: DB, username: string | null, email: string) {
	const [byName] = username
		? await db.select().from(schema.user).where(eq(schema.user.username, username)).limit(1)
		: [];
	if (byName && isPlaceholder(byName.googleSub)) return byName;

	const [byEmail] = await db.select().from(schema.user).where(eq(schema.user.email, email)).limit(1);
	return byEmail && isPlaceholder(byEmail.googleSub) ? byEmail : null;
}
