import { redirect } from '@sveltejs/kit';
import { beginSignIn, callbackUri, cookieOptions, originOf } from '$lib/server/auth';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url, cookies, platform }) => {
	const env = platform!.env;
	const next = url.searchParams.get('next') ?? '/claim';
	const pending = await beginSignIn(env, callbackUri(env, url), next);

	// Both halves of the handshake live in short cookies rather than a table:
	// the state proves the callback is answering this browser's request, and the
	// verifier proves it is answering this browser's code.
	const opts = {
		...cookieOptions(originOf(env, url).startsWith('https:')),
		maxAge: 600
	};
	cookies.set('oauth_state', pending.state, opts);
	cookies.set('oauth_verifier', pending.verifier, opts);

	redirect(303, pending.url);
};
