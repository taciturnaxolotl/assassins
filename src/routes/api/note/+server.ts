import { error } from '@sveltejs/kit';
import { setNote } from '$lib/server/game';
import { isPlayer, mayWrite } from '$lib/server/access';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request, locals }) => {
	const { access, db } = locals;
	if (!access.user || !isPlayer(access.tier)) error(403, 'Not in the game.');
	if (!mayWrite(access)) error(403, 'You are looking at somebody else\'s session.');
	const { gmId, body } = (await request.json()) as { gmId: string; body: string };
	await setNote(db, access.user.id, gmId, body ?? '');
	return new Response(null, { status: 204 });
};
