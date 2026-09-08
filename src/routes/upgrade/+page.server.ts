import { redirect } from '@sveltejs/kit';
import { landingFor } from '$lib/server/access';
import { loadChain } from '$lib/server/game';
import { teaser } from '$lib/server/data';
import { targetOf } from '$lib/game/chain';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	const { access, db } = locals;
	if (access.tier === 'anon' || access.tier === 'unclaimed' || access.tier === 'pending' || access.tier === 'denied')
		redirect(303, landingFor(access.tier));

	// Pitch the specific file they are actually stuck outside of.
	let pitch = null;
	if (access.gmId && access.tier !== 'pro') {
		const mark = targetOf(await loadChain(db), access.gmId);
		if (mark) pitch = await teaser(db, mark);
	}

	return { pitch, already: access.tier === 'pro' };
};
