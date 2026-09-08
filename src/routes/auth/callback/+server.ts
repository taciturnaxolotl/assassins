import { redirect } from '@sveltejs/kit';
import {
	callbackUri,
	cookieOptions,
	exchangeCode,
	originOf,
	SESSION_COOKIE,
	startSession,
	unpackState,
	upsertUser
} from '$lib/server/auth';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url, cookies, locals, platform }) => {
	const env = platform!.env;
	const secure = originOf(env, url).startsWith('https:');

	const fail = (why: string) => {
		cookies.delete('oauth_state', { path: '/' });
		cookies.delete('oauth_verifier', { path: '/' });
		redirect(303, `/?error=${encodeURIComponent(why)}`);
	};

	if (url.searchParams.get('error')) fail('Google sign-in was cancelled.');

	const code = url.searchParams.get('code');
	const raw = url.searchParams.get('state');
	const verifier = cookies.get('oauth_verifier');
	if (!code || !raw || !verifier) fail('That sign-in link has gone stale. Try again.');

	const { state, next } = unpackState(raw!);
	if (state !== cookies.get('oauth_state')) fail('That sign-in did not start here.');

	let userId: string;
	try {
		// Byte-identical to the one sent out, or Google rejects the exchange.
		const who = await exchangeCode(env, code!, verifier!, callbackUri(env, url));
		userId = await upsertUser(locals.db, env, who);
	} catch (e) {
		fail((e as Error).message);
		return new Response(); // unreachable; redirect throws
	}

	cookies.delete('oauth_state', { path: '/' });
	cookies.delete('oauth_verifier', { path: '/' });

	const { token } = await startSession(locals.db, userId);
	cookies.set(SESSION_COOKIE, token, cookieOptions(secure));

	redirect(303, next);
};
