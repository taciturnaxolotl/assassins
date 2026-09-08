import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals }) => {
	const { tier } = locals.access;
	if (tier === 'pending')
		error(403, 'Your claim is still in the queue. You can file your draw in the meantime.');
	if (tier !== 'pro') error(402, 'Unlocking the dossiers covers the campus map.');
	return {};
};
