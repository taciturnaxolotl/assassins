// The approval queue, and the levers for when a claim is nearly right.
//
// Approving is usually a glance: the directory already matched the account's
// Cedarville username to a student, and the build carried that through, so the
// queue mostly shows agreement. The interesting rows are the seven players the
// build could never resolve, where somebody's word is the only evidence there is.

import { error, fail } from '@sveltejs/kit';
import { desc, eq } from 'drizzle-orm';
import { schema } from '$lib/server/db';
import { exists, roster } from '$lib/server/data';
import { clearKill, confirmKill, loadChain, pendingKills } from '$lib/server/game';
import type { Actions, PageServerLoad } from './$types';

const guard = (locals: App.Locals) => {
	if (!locals.access.isAdmin) error(403, 'Not yours.');
	return locals.access.user!;
};

export const load: PageServerLoad = async ({ locals }) => {
	guard(locals);
	const { db } = locals;

	const [claims, cards, chain, unconfirmed] = await Promise.all([
		db
			.select({
				claim: schema.claim,
				user: {
					id: schema.user.id,
					name: schema.user.name,
					email: schema.user.email,
					username: schema.user.username,
					image: schema.user.image,
					plan: schema.user.plan
				}
			})
			.from(schema.claim)
			.innerJoin(schema.user, eq(schema.user.id, schema.claim.userId))
			.orderBy(desc(schema.claim.createdAt)),
		roster(db),
		loadChain(db),
		pendingKills(db)
	]);

	const names = new Map(cards.map((c) => [c.gmId, c]));

	return {
		// Reported kills nobody has agreed with yet. Until one is confirmed the
		// victim is still hunting and the killer has inherited nothing, so this
		// queue is what actually moves the game along.
		kills: unconfirmed.map((k) => ({
			victimGmId: k.victimGmId,
			victim: names.get(k.victimGmId)?.name ?? k.victimGmId,
			killerGmId: k.killerGmId,
			killer: k.killerGmId ? (names.get(k.killerGmId)?.name ?? k.killerGmId) : null,
			at: k.createdAt
		})),
		roster: cards.map((c) => ({ gmId: c.gmId, name: c.name, matched: c.matched })),
		chain,
		rows: claims.map(({ claim, user }) => ({
			...claim,
			user,
			as: claim.gmId ? (names.get(claim.gmId)?.name ?? claim.gmId) : 'Free agent',
			freeAgent: !claim.gmId,
			// The claim agrees with the directory. Nothing to investigate.
			vouched: !!claim.gmId && !!user.username && names.get(claim.gmId)?.matched === true
		}))
	};
};

export const actions: Actions = {
	decide: async ({ request, locals }) => {
		const admin = guard(locals);
		const form = await request.formData();
		const userId = String(form.get('userId') ?? '');
		const status = String(form.get('status') ?? '');
		const gmId = String(form.get('gmId') ?? '');
		const verdict = String(form.get('verdict') ?? '').slice(0, 300) || null;

		if (!['approved', 'denied', 'pending'].includes(status))
			return fail(400, { message: 'Approve, deny or reset.' });
		if (gmId && !(await exists(locals.db, gmId)))
			return fail(400, { message: 'No such player.' });

		// Approving somebody as a player who is already spoken for would put two
		// accounts on one row of the ring, so it is refused rather than resolved.
		if (status === 'approved') {
			const clash = await locals.db
				.select()
				.from(schema.claim)
				.where(eq(schema.claim.gmId, gmId));
			const other = clash.find((c) => c.userId !== userId && c.status === 'approved');
			if (other) return fail(409, { message: 'That player is already approved to someone else.' });
		}

		await locals.db
			.update(schema.claim)
			.set({
				status,
				verdict,
				// An admin can fix a claim that named the wrong player rather than
				// bouncing it back and making them apply again.
				...(gmId ? { gmId } : {}),
				decidedBy: admin.id,
				decidedAt: new Date()
			})
			.where(eq(schema.claim.userId, userId));

		return { message: `${status}.` };
	},

	kill: async ({ request, locals }) => {
		guard(locals);
		const form = await request.formData();
		const victimGmId = String(form.get('victimGmId') ?? '');
		if (!victimGmId) return fail(400, { message: 'Who?' });

		if (form.get('verdict') === 'confirm') {
			await confirmKill(locals.db, victimGmId);
			return { message: 'Kill confirmed. Their hunter has inherited.' };
		}
		await clearKill(locals.db, victimGmId);
		return { message: 'Claim thrown out.' };
	},

	comp: async ({ request, locals }) => {
		guard(locals);
		const form = await request.formData();
		const userId = String(form.get('userId') ?? '');
		const plan = String(form.get('plan') ?? 'free');
		await locals.db
			.update(schema.user)
			.set({ plan, updatedAt: new Date() })
			.where(eq(schema.user.id, userId));
		return { message: `Moved to ${plan}.` };
	}
};
