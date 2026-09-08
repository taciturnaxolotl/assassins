import { redirect } from '@sveltejs/kit';
import { endSession, SESSION_COOKIE } from '$lib/server/auth';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ cookies, locals }) => {
	await endSession(locals.db, cookies.get(SESSION_COOKIE));
	cookies.delete(SESSION_COOKIE, { path: '/' });
	redirect(303, '/');
};
