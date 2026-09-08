import { board } from '$lib/server/market';
import type { PageServerLoad } from './$types';

// The board is open to every player. It is the one part of the app that is
// never paywalled, because a contract is how somebody without a subscription
// gets into a dossier at all.
export const load: PageServerLoad = async ({ locals }) => {
	const { access, db } = locals;
	return {
		contracts: await board(db, { userId: access.user!.id, gmId: access.gmId })
	};
};
