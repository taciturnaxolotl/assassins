import { handleWebhook } from '$lib/server/billing';
import type { RequestHandler } from './$types';

// Polar's word on whether somebody is paid up. It writes the answer onto the
// user row, so no page ever has to ask.
export const POST: RequestHandler = async ({ request, locals }) => {
	// The raw body, byte for byte: the signature is over exactly this.
	const body = await request.text();
	const result = await handleWebhook(locals.env, locals.db, body, request.headers);
	// Worth a line in the log — a webhook that silently does nothing is the
	// hardest kind of billing bug to see.
	console.log(`[polar] ${result.note ?? ''} (${result.status})`);
	return new Response(null, { status: result.status });
};
