import { handleWebhook } from '$lib/server/billing';
import type { RequestHandler } from './$types';

// Polar's word on whether somebody is paid up. It writes the answer onto the
// user row, so no page ever has to ask.
export const POST: RequestHandler = async ({ request, locals }) => {
	const body = await request.text();
	const { status } = await handleWebhook(locals.env, locals.db, body, request.headers);
	return new Response(null, { status });
};
