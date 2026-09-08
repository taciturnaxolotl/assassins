import { building } from '$app/environment';
import { readSession, SESSION_COOKIE, type Env } from '$lib/server/auth';
import { db } from '$lib/server/db';
import { accessFor, ANON } from '$lib/server/access';
import type { Handle } from '@sveltejs/kit';

export const handle: Handle = async ({ event, resolve }) => {
	if (building) return resolve(event);

	const env = event.platform?.env as unknown as Env;
	event.locals.env = env;
	event.locals.db = db(env.DB);

	const user = await readSession(event.locals.db, event.cookies.get(SESSION_COOKIE));
	event.locals.access = user ? await accessFor(event.locals.db, user) : ANON;

	return resolve(event);
};
