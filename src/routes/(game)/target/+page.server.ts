import { loadChain } from '$lib/server/game';
import { teaser } from '$lib/server/data';
import { targetOf } from '$lib/game/chain';
import type { PageServerLoad } from './$types';

// A free account gets told exactly what exists on their target and nothing
// that is in it. Computing the pitch here keeps the paywalled columns from
// ever being selected into a payload the browser can see.
export const load: PageServerLoad = async ({ locals }) => {
	const { access, db } = locals;
	if (access.tier === 'pro' || !access.gmId) return { pitch: null };

	const chain = await loadChain(db);
	const mark = targetOf(chain, access.gmId);
	return { pitch: mark ? await teaser(db, mark) : null };
};
