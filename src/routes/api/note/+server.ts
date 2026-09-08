import { error } from '@sveltejs/kit';
import { setNote } from '$lib/server/game';
import { isPlayer } from '$lib/server/access';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request, locals }) => {
	const { access, db } = locals;
	if (!access.user || !isPlayer(access.tier)) error(403, 'Not in the game.');
	const { gmId, body } = (await request.json()) as { gmId: string; body: string };
	await setNote(db, access.user.id, gmId, body ?? '');
	return new Response(null, { status: 204 });
};
