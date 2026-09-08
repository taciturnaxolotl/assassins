import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

// The sealed dossier is where the file gets sold — it shows the thing being
// bought, which no separate page can. What is left here is the receipt.
export const load: PageServerLoad = ({ locals }) => {
	if (locals.access.tier !== 'pro') redirect(303, '/target');
	return {};
};
