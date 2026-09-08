import { json } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { schema } from '$lib/server/db';
import { isPlayer } from '$lib/server/access';
import type { RequestHandler } from './$types';

// The secret. Give it a student id and it hands back that player's timetable,
// which the projection otherwise keeps for admins. The id is the whole lock:
// you have to already know it, and Cedarville ids are short numbers, so this is
// a back door held shut by a thing that is not much of a secret. That is the
// point of hiding it behind the wordmark rather than putting it in the nav.
export const POST: RequestHandler = async ({ request, locals }) => {
	const { access, db } = locals;
	// Still only for people in the game. The wordmark trick lowers the wall
	// between players; it does not open the whole thing to the internet.
	if (!access.user || !isPlayer(access.tier)) return json({ found: false }, { status: 403 });

	const id = String(((await request.json().catch(() => ({}))) as { id?: string }).id ?? '').trim();
	if (!id) return json({ found: false });

	// Resolve the id to a player; the page keyed by gmId does the rest. Nobody's
	// id and an unknown id give the same answer, so a miss cannot be told from a
	// guess.
	const [row] = await db
		.select({ gmId: schema.player.gmId })
		.from(schema.player)
		.where(eq(schema.player.studentId, id))
		.limit(1);

	if (!row) return json({ found: false });
	return json({ found: true, gmId: row.gmId });
};
