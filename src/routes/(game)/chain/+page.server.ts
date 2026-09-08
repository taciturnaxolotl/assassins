import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

// The whole ring, which is the game's one real secret. Running the game is the
// only reason to see it; paying is not.
export const load: PageServerLoad = ({ locals }) => {
	if (!locals.access.isAdmin) error(403, 'The ring is not for players to read.');
	return {};
};
