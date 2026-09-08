import { redirect } from '@sveltejs/kit';
import { isPlayer, landingFor } from '$lib/server/access';
import { campus, onePlayer, playerByStudentId, project } from '$lib/server/data';
import { chainFor, loadNotes } from '$lib/server/game';
import type { Player } from '$lib/game/types';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ locals, url }) => {
	const { access, db } = locals;
	if (!isPlayer(access.tier)) redirect(303, landingFor(access.tier));

	const [projection, chain, notes] = await Promise.all([
		project(db, access),
		chainFor(db, access.gmId, access.isAdmin),
		loadNotes(db, access.user!.id)
	]);

	// Some pages want a whole file rather than the public card, and the campus to
	// draw it on: your own page, always, and any page the x-ray has been pointed
	// at with a student id. Admins already have everything.
	if (!access.isAdmin) {
		const wanted: Player[] = [];

		// Your own file in full — the You tab is your file, and you get all of it.
		if (access.gmId && url.pathname === `/player/${access.gmId}`) {
			const me = await onePlayer(db, access.gmId);
			if (me) wanted.push(me);
		}

		// The x-ray: a valid student id opens that one player's whole file.
		const id = url.searchParams.get('id');
		if (id) {
			const them = await playerByStudentId(db, id);
			if (them) wanted.push(them);
		}

		if (wanted.length) {
			const ids = new Set(wanted.map((p) => p.gmId));
			projection.players = [...wanted, ...projection.players.filter((p) => !ids.has(p.gmId))];
			projection.campus = await campus(db);
		}
	}

	// Whichever full files were folded in, the chain above is still the ordinary
	// player's view, so nobody's target — not even who is hunting you — leaves.
	return {
		...projection,
		chain,
		notes,
		me: access.gmId,
		isAdmin: access.isAdmin,
		isFreeAgent: access.isFreeAgent
	};
};
