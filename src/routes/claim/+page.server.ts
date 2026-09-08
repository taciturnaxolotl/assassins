import { fail, redirect } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { schema } from '$lib/server/db';
import { exists, meta, suggestFor } from '$lib/server/data';
import { landingFor, mayWrite } from '$lib/server/access';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	const { access, db } = locals;
	if (!access.user) redirect(303, '/');
	if (access.tier !== 'unclaimed') redirect(303, landingFor(access.tier));

	const [{ term }, suggestions] = await Promise.all([
		meta(db),
		suggestFor(db, access.user.username, access.user.name)
	]);

	// The directory resolved this account's own address to a player. There is
	// nothing to choose, so the roster is not sent: the page cannot offer an
	// alternative it was never given.
	const certain = suggestions.find((s) => s.certain);
	if (certain)
		return {
			term,
			username: access.user.username,
			displayName: access.user.name,
			certain,
			roster: [] as { gmId: string; name: string }[],
			taken: [] as string[]
		};

	const [roster, taken] = await Promise.all([
		db.select({ gmId: schema.player.gmId, name: schema.player.name }).from(schema.player),
		// Who is already spoken for, so nobody applies as a player who is taken.
		db.select({ gmId: schema.claim.gmId }).from(schema.claim).where(eq(schema.claim.status, 'approved'))
	]);

	return {
		term,
		username: access.user.username,
		displayName: access.user.name,
		certain: null,
		roster: roster.sort((a, b) => a.name.localeCompare(b.name)),
		taken: taken.map((t) => t.gmId)
	};
};

export const actions: Actions = {
	default: async ({ request, locals }) => {
		const { access, db } = locals;
		if (!access.user || access.tier !== 'unclaimed') redirect(303, '/');
		if (!mayWrite(access)) return fail(403, { message: 'You are viewing as somebody else.' });

		const form = await request.formData();
		const pitch = String(form.get('pitch') ?? '').slice(0, 500);

		// When the directory resolves this account's own address to a player,
		// that is the answer and the form does not get a say. Trusting the field
		// would let anyone post their way into somebody else's dossier — and it
		// is also what stops a player quietly declaring themselves a free agent
		// to get out of being hunted.
		const certain = (await suggestFor(db, access.user.username, access.user.name)).find(
			(s) => s.certain
		);

		const wantsAgent = !certain && form.get('kind') === 'agent';
		const gmId = certain ? certain.gmId : wantsAgent ? null : String(form.get('gmId') ?? '');

		if (!wantsAgent && (!gmId || !(await exists(db, gmId))))
			return fail(400, { message: 'Pick a player from the roster.' });

		if (gmId) {
			const [claimed] = await db
				.select()
				.from(schema.claim)
				.where(eq(schema.claim.gmId, gmId))
				.limit(1);

			if (claimed?.status === 'approved' && claimed.userId !== access.user.id) {
				// A directory match is the strongest evidence there is, and it is
				// unique: one Cedarville username resolves to one player. So a
				// collision means somebody else claimed this player by hand, and
				// the directory wins. Their claim goes back in the queue rather
				// than this one hitting a wall it cannot argue with.
				if (!certain)
					return fail(409, { message: 'Somebody has already been approved as that player.' });

				await db
					.update(schema.claim)
					.set({
						status: 'pending',
						verdict: 'Displaced by a directory match. Confirm who this actually is.',
						decidedBy: access.user.id,
						decidedAt: new Date()
					})
					.where(eq(schema.claim.userId, claimed.userId));
			}
		}

		// A directory match needs no human: the account's own Cedarville address
		// resolved to a student id in the official directory, which is better
		// evidence than somebody glancing at a queue. That leaves the queue for
		// what it is actually for — the seven players the build could never
		// resolve, and anyone whose address does not match.
		// Free agents assert no identity, so there is nothing for the directory to
		// agree with and a human still has to let them in.
		const self = access.isAdmin || !!certain;
		await db.insert(schema.claim).values({
			userId: access.user.id,
			gmId,
			pitch: pitch || null,
			status: self ? 'approved' : 'pending',
			verdict: certain ? 'Directory match.' : access.isAdmin ? 'Runs the game.' : null,
			decidedBy: self ? access.user.id : null,
			decidedAt: self ? new Date() : null,
			createdAt: new Date()
		});

		redirect(303, self ? '/target' : '/pending');
	}
};
