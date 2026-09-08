// Every edit to the ring comes through here, so the rules about who may say
// what live in one place.
//
// You may report your own draw and claim your own kills. Being killed is the
// one thing you may report about yourself, because the victim always knows.
// Everything else is the admin's.

import { error, json } from '@sveltejs/kit';
import { chainFor, clearKill, killRow, setAssignment, setKill } from '$lib/server/game';
import { isPlayer } from '$lib/server/access';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request, locals }) => {
	const { access, db } = locals;
	if (!access.user || !isPlayer(access.tier) || !access.gmId) error(403, 'Not in the game.');

	const body = (await request.json()) as {
		action: string;
		hunterGmId?: string;
		victimGmId?: string;
		killerGmId?: string | null;
	};
	const me = access.gmId;
	const admin = access.isAdmin;

	try {
		switch (body.action) {
			case 'assign': {
				const hunter = body.hunterGmId ?? me;
				if (hunter !== me && !admin) error(403, 'You can only report your own draw.');
				await setAssignment(db, hunter, body.victimGmId ?? null, access.user.id);
				break;
			}
			case 'kill': {
				const victim = body.victimGmId;
				if (!victim) error(400, 'Who?');
				const killer = body.killerGmId ?? null;
				// The killer is claiming it, or the victim is admitting it.
				const mine = killer === me || victim === me;
				if (!mine && !admin) error(403, 'Only the two people involved can report a kill.');
				// Reporting is not the same as it having happened. Until somebody
				// running the game agrees, the victim is still in the ring and the
				// killer has not inherited anything.
				await setKill(db, victim, killer, access.user.id, admin);
				break;
			}
			case 'revive': {
				const victim = body.victimGmId;
				if (!victim) error(400, 'Who?');
				// The raw row, not the chain: an unconfirmed claim is invisible to
				// `loadChain`, so checking there would stop somebody taking back
				// the very claim they had just made.
				const row = await killRow(db, victim);
				if (!row) error(404, 'Nothing reported.');
				const mine = row.killerGmId === me || victim === me;
				if (!mine && !admin) error(403, 'Not yours to undo.');
				if (row.confirmed && !admin) error(403, 'That one is settled.');
				await clearKill(db, victim);
				break;
			}
			default:
				error(400, 'Unknown action.');
		}
	} catch (e) {
		if (e && typeof e === 'object' && 'status' in e) throw e;
		error(400, (e as Error).message);
	}

	return json(await chainFor(db, access.gmId, access.isAdmin));
};
