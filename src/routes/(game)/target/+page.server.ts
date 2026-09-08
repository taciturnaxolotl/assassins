import { redirect } from '@sveltejs/kit';
import { loadChain } from '$lib/server/game';
import { teaser } from '$lib/server/data';
import { syncPlan } from '$lib/server/billing';
import { targetOf } from '$lib/game/chain';
import type { PageServerLoad } from './$types';

// A free account gets told exactly what exists on their target and nothing
// that is in it. Computing the pitch here keeps the paywalled columns from
// ever being selected into a payload the browser can see.
export const load: PageServerLoad = async ({ locals, url }) => {
	const { access, db } = locals;

	// Straight back from checkout. Polar's webhook is the normal way the plan
	// gets written, but the browser beats it here every time, so ask outright
	// rather than showing the paywall to somebody who has just paid.
	if (url.searchParams.has('welcome') && access.user) {
		const plan = await syncPlan(locals.env, db, access.user.id);
		if (plan === 'pro' && access.tier !== 'pro') redirect(303, '/target');
	}
	if (access.tier === 'pro' || !access.gmId) return { pitch: null };

	const chain = await loadChain(db);
	const mark = targetOf(chain, access.gmId);
	return { pitch: mark ? await teaser(db, mark) : null };
};
