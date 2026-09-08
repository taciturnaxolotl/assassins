import { landingFor } from '$lib/server/access';
import { campus, meta } from '$lib/server/data';
import { inventPlayer } from '$lib/server/demo';
import type { PageServerLoad } from './$types';

// Signed in or not, the door stays open. Bouncing a signed-in visitor straight
// past it meant nobody who plays could ever see the demo again, and left no
// way to tell whether you were signed in at all.
export const load: PageServerLoad = async ({ locals }) => {
	const { access } = locals;
	const [{ term }, map] = await Promise.all([meta(locals.db), campus(locals.db)]);

	// A weekday, so the invented schedule has somewhere to happen.
	const day = 1 + Math.floor(Math.random() * 5);

	return {
		term,
		campus: map,
		demo: map ? inventPlayer(map, day) : null,
		day,
		signedIn: access.user ? { name: access.user.name, to: landingFor(access.tier) } : null
	};
};
