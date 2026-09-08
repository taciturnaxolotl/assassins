import { error, redirect } from '@sveltejs/kit';
import { enabled, portalUrl } from '$lib/server/billing';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ locals }) => {
	const { access, env } = locals;
	if (!access.user) error(403, 'Sign in first.');
	if (!enabled(env)) error(503, 'Billing is not switched on yet.');

	const url = await portalUrl(env, access.user.id);
	// Nothing was ever bought through Polar, so there is no bill to manage.
	if (!url) error(404, 'Nothing to manage — this account has not paid for anything.');

	redirect(303, url);
};
