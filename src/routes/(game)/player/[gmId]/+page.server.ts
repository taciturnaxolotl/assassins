import { error } from '@sveltejs/kit';
import { onePlayer, teaser } from '$lib/server/data';
import type { PageServerLoad } from './$types';

// One page per player, which is the same dossier the Target tab renders. What
// you get here is decided by the projection, not by this route: if the file is
// not yours to read, the store simply does not contain it and the page says so.
export const load: PageServerLoad = async ({ params, locals }) => {
	const { access, db } = locals;
	const player = await onePlayer(db, params.gmId);
	if (!player) error(404, 'No such player.');

	return {
		gmId: player.gmId,
		name: player.name,
		pitch: access.tier === 'pro' ? null : await teaser(db, player.gmId)
	};
};
