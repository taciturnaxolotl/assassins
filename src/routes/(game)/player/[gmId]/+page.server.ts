import { error } from '@sveltejs/kit';
import { exists } from '$lib/server/data';
import type { PageServerLoad } from './$types';

// One page per player, which is the same file the Target tab renders. How much
// of it there is to render is decided by the projection, not by this route.
export const load: PageServerLoad = async ({ params, locals }) => {
	if (!(await exists(locals.db, params.gmId))) error(404, 'No such player.');
	return { gmId: params.gmId };
};
