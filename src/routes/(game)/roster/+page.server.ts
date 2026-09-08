import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

// For running the game, not playing it. Hiding the tab is not access control,
// so the route says the same thing the nav does.
export const load: PageServerLoad = ({ locals }) => {
	if (!locals.access.isAdmin) error(403, 'The roster is not for players.');
	return {};
};
