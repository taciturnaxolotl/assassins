// Put on somebody else's session, or take it off.
//
// The cookie only names a user; whether it is honoured is decided in
// `hooks.server.ts` from the real session on every request, so holding the
// cookie after losing admin does nothing.

import { error, redirect } from '@sveltejs/kit';
import { SPOOF_COOKIE, SPOOF_WRITE_COOKIE } from '../../../hooks.server';
import { accountFor } from '$lib/server/placeholder';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request, cookies, locals, url }) => {
	const { access } = locals;
	// The real account, not the one being worn: an impersonated session must not
	// be able to hop to a third.
	const admin = access.realUser ?? access.user;
	if (!admin || admin.role !== 'admin') error(403, 'Not yours.');

	const form = await request.formData();
	const back = String(form.get('back') ?? '/admin');

	// Arming or disarming writes for the session already being worn.
	if (form.has('write')) {
		const on = form.get('write') === '1';
		if (on)
			cookies.set(SPOOF_WRITE_COOKIE, '1', {
				path: '/',
				httpOnly: true,
				sameSite: 'lax',
				secure: url.protocol === 'https:'
			});
		else cookies.delete(SPOOF_WRITE_COOKIE, { path: '/' });
		console.log(`[spoof] ${admin.email} writes ${on ? 'ARMED' : 'off'}`);
		redirect(303, back);
	}

	// Either an account, or a roster player who has never signed in — in which
	// case the seat gets made now and behaves like any other.
	const gmId = String(form.get('gmId') ?? '');
	const userId = gmId ? await accountFor(locals.db, gmId) : String(form.get('userId') ?? '');

	if (!userId || userId === admin.id) {
		cookies.delete(SPOOF_COOKIE, { path: '/' });
		cookies.delete(SPOOF_WRITE_COOKIE, { path: '/' });
		redirect(303, back);
	}

	// A fresh session starts read-only, whatever the last one was armed to.
	cookies.delete(SPOOF_WRITE_COOKIE, { path: '/' });

	cookies.set(SPOOF_COOKIE, userId, {
		path: '/',
		httpOnly: true,
		sameSite: 'lax',
		secure: url.protocol === 'https:'
	});
	console.log(`[spoof] ${admin.email} is now viewing as ${userId}`);
	redirect(303, '/target');
};
