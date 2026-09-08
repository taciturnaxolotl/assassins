import { redirect } from '@sveltejs/kit';
import { landingFor } from '$lib/server/access';
import { onePlayer } from '$lib/server/data';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	const { access, db } = locals;
	if (!access.user) redirect(303, '/');
	// Waiting no longer means waiting *here* — a pending claim can still file its
	// draw, so it belongs in the game. Only a refusal ends up on this page.
	if (access.tier !== 'denied') redirect(303, landingFor(access.tier));

	const claimed = access.claim?.gmId ? await onePlayer(db, access.claim.gmId) : null;
	// A refused free agent applied to be nobody in particular.
	return { as: claimed?.name ?? 'a free agent', verdict: access.claim?.verdict ?? null };
};
