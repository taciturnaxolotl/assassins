import { json } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { schema } from '$lib/server/db';
import { isPlayer } from '$lib/server/access';
import { meta } from '$lib/server/data';
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

	const [row] = await db
		.select({ name: schema.player.name, schedule: schema.player.schedule })
		.from(schema.player)
		.where(eq(schema.player.studentId, id))
		.limit(1);

	// The same answer whether the id is nobody's or simply has no timetable on
	// file, so a wrong guess cannot be told apart from an empty one.
	if (!row?.schedule?.length) return json({ found: false });

	const { term } = await meta(db);
	return json({ found: true, name: row.name, term, schedule: row.schedule });
};
