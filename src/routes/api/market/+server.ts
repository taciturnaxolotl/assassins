// Every move on the board, with the rules about who may make it in one place.

import { error, json } from '@sveltejs/kit';
import { isPlayer } from '$lib/server/access';
import {
	acceptBid,
	board,
	cancelContract,
	placeBid,
	postContract,
	settle,
	withdrawBid
} from '$lib/server/market';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request, locals }) => {
	const { access, db } = locals;
	if (!access.user || !isPlayer(access.tier)) error(403, 'Not in the game.');

	// A free agent has no gmId. They may bid on anything and post nothing,
	// because posting is putting a price on the person you are hunting.
	const me = { userId: access.user.id, gmId: access.gmId };
	const body = (await request.json()) as {
		action: string;
		contractId?: string;
		hitmanUserId?: string;
		offer?: string;
		ask?: string;
		heldBy?: string;
		terms?: string;
		pitch?: string;
	};

	try {
		switch (body.action) {
			case 'post':
				if (!me.gmId) error(403, 'Free agents take jobs; they do not set them.');
				await postContract(db, { userId: me.userId, gmId: me.gmId }, {
					offer: body.offer ?? '',
					heldBy: body.heldBy ?? null,
					terms: body.terms ?? null
				});
				break;
			case 'cancel':
				await cancelContract(db, need(body.contractId), me.userId);
				break;
			case 'bid':
				await placeBid(db, need(body.contractId), me, {
					ask: body.ask ?? '',
					pitch: body.pitch ?? null
				});
				break;
			case 'withdraw':
				await withdrawBid(db, need(body.contractId), me.userId);
				break;
			case 'accept':
				await acceptBid(db, need(body.contractId), need(body.hitmanUserId), me.userId);
				break;
			case 'settle':
				await settle(db, need(body.contractId), me.userId);
				break;
			default:
				error(400, 'Unknown action.');
		}
	} catch (e) {
		if (e && typeof e === 'object' && 'status' in e) throw e;
		error(400, (e as Error).message);
	}

	return json(await board(db, me));
};

const need = (v: string | undefined) => {
	if (!v) error(400, 'Which one?');
	return v;
};
