import { redirect } from '@sveltejs/kit';
import { isPlayer, landingFor } from '$lib/server/access';
import { campus, playerByStudentId, project } from '$lib/server/data';
import { chainFor, loadNotes } from '$lib/server/game';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ locals, url }) => {
	const { access, db } = locals;
	if (!isPlayer(access.tier)) redirect(303, landingFor(access.tier));

	const [projection, chain, notes] = await Promise.all([
		project(db, access),
		chainFor(db, access.gmId, access.isAdmin),
		loadNotes(db, access.user!.id)
	]);

	// The x-ray. A student id in the URL opens that one player's whole file, and
	// the campus to draw it on — the personal detail an admin sees, but never
	// the ring. `chain` above is still the ordinary player's view, so who anyone
	// is hunting stays sealed; this only fills in schedules, rooms and the map.
	const id = url.searchParams.get('id');
	if (id && !access.isAdmin) {
		const full = await playerByStudentId(db, id);
		if (full) {
			projection.players = [full, ...projection.players.filter((p) => p.gmId !== full.gmId)];
			projection.campus = await campus(db);
		}
	}

	return {
		...projection,
		chain,
		notes,
		me: access.gmId,
		isAdmin: access.isAdmin,
		isFreeAgent: access.isFreeAgent
	};
};
