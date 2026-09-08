import { error, redirect } from '@sveltejs/kit';
import { checkoutUrl, enabled } from '$lib/server/billing';
import { isPlayer } from '$lib/server/access';
import { originOf } from '$lib/server/auth';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ locals, url }) => {
	const { access, env } = locals;
	if (!access.user || !isPlayer(access.tier)) error(403, 'Not in the game.');
	if (!enabled(env)) error(503, 'Billing is not switched on yet.');

	redirect(303, await checkoutUrl(env, access.user, originOf(env, url)));
};
