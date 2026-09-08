import { error, redirect } from '@sveltejs/kit';
import { enabled, portalUrl } from '$lib/server/billing';
import { originOf } from '$lib/server/auth';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ locals, url }) => {
	const { access, env } = locals;
	if (!access.user) error(403, 'Sign in first.');
	if (!enabled(env)) error(503, 'Billing is not switched on yet.');

	redirect(303, await portalUrl(env, access.user.id, originOf(env, url)));
};
