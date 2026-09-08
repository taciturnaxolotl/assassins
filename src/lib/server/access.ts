// One place decides what a request may see, and every route asks it.

import { eq } from 'drizzle-orm';
import type { DB } from './db';
import { schema } from './db';
import type { Tier } from '$lib/game/types';

export type Account = {
	id: string;
	name: string;
	email: string;
	image: string | null;
	username: string | null;
	role: string;
	/** When paid access runs out. Null means it does not. */
};

export type Access = {
	user: Account | null;
	/**
	 * The admin behind an impersonated session. Null when nobody is pretending.
	 * `user` is who the app answers as; this is who is actually here.
	 */
	realUser?: Account | null;
	tier: Tier;
	/** The player this account has been approved as. */
	gmId: string | null;
	/** Approved, but nobody on the roster, so outside the ring entirely. */
	isFreeAgent: boolean;
	claim: typeof schema.claim.$inferSelect | null;
	isAdmin: boolean;
	/** An impersonated session has been explicitly armed to write. */
	spoofWrite?: boolean;
};

export const ANON: Access = {
	user: null,
	realUser: null,
	tier: 'anon',
	gmId: null,
	claim: null,
	isAdmin: false,
	isFreeAgent: false
};

/** Somebody is wearing another account's session. */
export const isSpoofing = (a: Access) => !!a.realUser && a.realUser.id !== a.user?.id;

/**
 * Impersonation looks, unless you say otherwise.
 *
 * Writing while wearing somebody else's session puts their name on a kill they
 * never claimed or a draw they never filed, and `reportedBy` records it as
 * theirs. That is sometimes exactly what you want — fixing a player's mistake
 * for them — but never by accident, so it is off until armed from the banner.
 */
export const mayWrite = (a: Access) => !isSpoofing(a) || !!a.spoofWrite;

/**
 * `known` is the claim when the caller already has it — `readSession` fetches it
 * on the same query it fetches the account, so the common path costs nothing
 * here. Impersonation is the case that still has to go and look.
 */
export async function accessFor(
	db: DB,
	user: Account | null,
	known?: typeof schema.claim.$inferSelect | null
): Promise<Access> {
	if (!user) return ANON;
	const isAdmin = user.role === 'admin';
	const claim =
		known !== undefined
			? known
			: (
					await db
						.select()
						.from(schema.claim)
						.where(eq(schema.claim.userId, user.id))
						.limit(1)
				)[0];

	// Being the one who runs the game does not exempt you from being in it:
	// an admin still has to say which player they are, or they would have no
	// target, no place in the ring, and a Target page with nothing on it.
	if (!claim)
		return { user, isAdmin, claim: null, gmId: null, tier: 'unclaimed', isFreeAgent: false };
	if (claim.status === 'denied')
		return { user, isAdmin, claim, gmId: null, tier: 'denied', isFreeAgent: false };

	// A claim still in the queue carries its gmId anyway. Waiting on a human is
	// no reason to be unable to file your own draw — that half of the app is
	// free for everyone, and the ring has a hole in it until they can. Reading
	// is what approval buys.
	if (claim.status !== 'approved')
		return { user, isAdmin, claim, gmId: claim.gmId, tier: 'pending', isFreeAgent: !claim.gmId };

	return {
		user,
		isAdmin,
		claim,
		gmId: claim.gmId,
		isFreeAgent: !claim.gmId,
		tier: 'player'
	};
}

/** Tiers that may file their own edges of the ring. */
export const isPlayer = (t: Tier) => t === 'pending' || t === 'player';

/** Tiers whose claim a human has agreed with. */
export const isApproved = (t: Tier) => t === 'player';

/** Where a tier belongs when it asks for a page it cannot have. */
export const landingFor = (t: Tier) =>
	t === 'anon' ? '/' : t === 'unclaimed' ? '/claim' : t === 'denied' ? '/pending' : '/target';
