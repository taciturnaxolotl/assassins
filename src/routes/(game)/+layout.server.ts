import { redirect } from '@sveltejs/kit';
import { isPlayer, landingFor } from '$lib/server/access';
import { project } from '$lib/server/data';
import { chainFor, loadNotes } from '$lib/server/game';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ locals }) => {
	const { access, db } = locals;
	if (!isPlayer(access.tier)) redirect(303, landingFor(access.tier));

	const [projection, chain, notes] = await Promise.all([
		project(db, access),
		chainFor(db, access.gmId, access.isAdmin),
		loadNotes(db, access.user!.id)
	]);

	return { ...projection, chain, notes, me: access.gmId, isAdmin: access.isAdmin, isFreeAgent: access.isFreeAgent };
};
