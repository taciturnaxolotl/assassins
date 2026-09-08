import { building } from '$app/environment';
import { readSession, SESSION_COOKIE, type Env } from '$lib/server/auth';
import { db, schema } from '$lib/server/db';
import { accessFor, ANON } from '$lib/server/access';
import { eq } from 'drizzle-orm';
import type { Handle } from '@sveltejs/kit';

export const SPOOF_COOKIE = 'assassins_spoof';
export const SPOOF_WRITE_COOKIE = 'assassins_spoof_write';

export const handle: Handle = async ({ event, resolve }) => {
	if (building) return resolve(event);

	const env = event.platform?.env as unknown as Env;
	event.locals.env = env;
	event.locals.db = db(env.DB);

	const me = await readSession(event.locals.db, event.cookies.get(SESSION_COOKIE));
	if (!me) {
		event.locals.access = ANON;
		return resolve(event);
	}

	// The claim rode along on the session query, so this costs no round trip.
	const mine = await accessFor(event.locals.db, me, me.claim);

	// Impersonation. Only an admin may, it is checked here on every request
	// against the real session rather than trusted from the cookie, and the
	// admin's own identity is carried alongside so they can always stop.
	const spoofId = event.cookies.get(SPOOF_COOKIE);
	if (mine.isAdmin && spoofId && spoofId !== me.id) {
		const [them] = await event.locals.db
			.select()
			.from(schema.user)
			.where(eq(schema.user.id, spoofId))
			.limit(1);
		if (them) {
			const theirs = await accessFor(event.locals.db, them as never);
			event.locals.access = {
				...theirs,
				realUser: me as never,
				spoofWrite: event.cookies.get(SPOOF_WRITE_COOKIE) === '1'
			};
			return resolve(event);
		}
		event.cookies.delete(SPOOF_COOKIE, { path: '/' });
	}

	event.locals.access = { ...mine, realUser: me as never };
	return resolve(event);
};
