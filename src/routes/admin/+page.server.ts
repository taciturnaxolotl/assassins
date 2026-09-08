// The queue: what needs a person, what the game looks like, and what has
// already been decided, in that order.
//
// Most of it needs nobody. The directory matches an account's own Cedarville
// username to a student and the build carries that through, so a claim usually
// arrives already agreed with and approves itself. What lands here is the
// residue: the four players the build could never resolve, free agents who
// assert no identity at all, and kills that only two people witnessed.

import { error, fail } from '@sveltejs/kit';
import { mayWrite } from '$lib/server/access';
import { desc, eq } from 'drizzle-orm';
import { schema } from '$lib/server/db';
import { exists, roster } from '$lib/server/data';
import { clearKill, confirmKill, loadChain, pendingKills, setKill } from '$lib/server/game';
import { enabled as groupmeOn, killProposals, markSeen } from '$lib/server/groupme';
import { targetOf } from '$lib/game/chain';
import type { Actions, PageServerLoad } from './$types';

const guard = (locals: App.Locals, writing = true) => {
	if (!locals.access.isAdmin) error(403, 'Not yours.');
	if (writing && !mayWrite(locals.access))
		error(403, "Stop viewing as somebody else before deciding anything.");
	return locals.access.user!;
};

export const load: PageServerLoad = async ({ locals, url }) => {
	guard(locals, false);
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
	const who = (gmId: string | null) => (gmId ? (names.get(gmId)?.name ?? gmId) : null);

	const rows = claims.map(({ claim, user }) => ({
		...claim,
		user,
		as: claim.gmId ? (names.get(claim.gmId)?.name ?? claim.gmId) : 'Free agent',
		freeAgent: !claim.gmId,
		// The directory already agrees. Nothing to investigate.
		vouched: !!claim.gmId && !!user.username && names.get(claim.gmId)?.matched === true
	}));

	// Who is spoken for. Everyone else on the roster is somebody who has not
	// signed in yet, which is the list worth chasing.
	const taken = new Set(
		claims.filter((c) => c.claim.status === 'approved' && c.claim.gmId).map((c) => c.claim.gmId!)
	);

	// Reading the topic means a call out to GroupMe, so it only happens when
	// asked for rather than on every page load.
	const syncing = url.searchParams.has('sync');
	let proposals: Awaited<ReturnType<typeof killProposals>> = [];
	let syncError: string | null = null;
	if (syncing) {
		try {
			proposals = await killProposals(db, locals.env);
		} catch (e) {
			syncError = (e as Error).message;
		}
	}

	return {
		groupme: { on: groupmeOn(locals.env), synced: syncing, proposals, error: syncError },
		needs: {
			claims: rows.filter((r) => r.status === 'pending'),
			// Until a kill is confirmed the victim is still hunting and the killer
			// has inherited nothing, so this is what actually moves the game along.
			kills: unconfirmed.map((k) => ({
				victimGmId: k.victimGmId,
				victim: who(k.victimGmId) ?? k.victimGmId,
				killer: who(k.killerGmId),
				// What confirming it would hand the killer — or, when the walk comes
				// back around to them, the end of the game.
				inherits: who(chain.assigned[k.victimGmId] ?? null),
				wins: !!k.killerGmId && chain.assigned[k.victimGmId] === k.killerGmId,
				at: k.createdAt
			}))
		},

		state: {
			players: cards.length,
			claimed: taken.size,
			pro: rows.filter((r) => r.status === 'approved' && r.user.plan === 'pro').length,
			agents: rows.filter((r) => r.status === 'approved' && r.freeAgent).length,
			reported: Object.keys(chain.assigned).length,
			down: Object.keys(chain.kills).length,
			unidentified: cards.filter((c) => !c.matched).length,
			// Alive, claimed, and has not said who they drew: a hole in the ring.
			quiet: cards.filter(
				(c) => taken.has(c.gmId) && !(c.gmId in chain.kills) && !chain.assigned[c.gmId]
			).length
		},

		unclaimed: cards
			.filter((c) => !taken.has(c.gmId))
			.map((c) => ({ gmId: c.gmId, name: c.name, matched: c.matched })),

		settled: rows.filter((r) => r.status !== 'pending'),
		roster: cards.map((c) => ({ gmId: c.gmId, name: c.name, matched: c.matched }))
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
		if (status === 'approved' && gmId) {
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

	// A proposal read out of the kills topic, agreed with or waved away.
	fromGroupMe: async ({ request, locals }) => {
		const admin = guard(locals);
		const form = await request.formData();
		const messageId = String(form.get('messageId') ?? '');
		const killerGmId = String(form.get('killerGmId') ?? '');
		const victimGmId = String(form.get('victimGmId') ?? '');
		if (!messageId) return fail(400, { message: 'Which message?' });

		if (form.get('verdict') !== 'confirm') {
			await markSeen(locals.db, messageId, 'ignored', admin.id);
			return { message: 'Left alone.' };
		}

		if (!victimGmId) return fail(400, { message: 'No victim to record.' });
		try {
			// Straight to confirmed: an admin reading the announcement is the
			// confirmation, so making them approve their own entry twice is
			// ceremony.
			await setKill(locals.db, victimGmId, killerGmId || null, admin.id, true);
		} catch (e) {
			return fail(400, { message: (e as Error).message });
		}
		await markSeen(locals.db, messageId, 'confirmed', admin.id);
		return { message: 'Recorded from GroupMe.' };
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
