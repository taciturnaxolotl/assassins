// Switches an admin throws while the game is running.
//
// One row per switch, read on the paths that care. They are separate from
// `dataset` because the build empties that table on every run, and nothing a
// person decided should be undone by rebuilding the roster.

import { eq } from 'drizzle-orm';
import type { DB } from './db';
import { schema } from './db';

/**
 * Approve a claim the moment it is made, even when the directory cannot vouch
 * for it.
 *
 * Off by default, and worth understanding before it goes on: a hand-picked
 * claim is somebody typing a name into a box. Approving it on sight means any
 * Cedarville account can claim any player nobody has claimed yet, and read that
 * player's dorm, room and schedule for free — a free account always sees its
 * own dossier in full, and with this on it decides for itself whose that is.
 *
 * Players already approved stay protected either way: claiming one is refused
 * before this is consulted.
 */
export const AUTO_APPROVE = 'autoApprove';

export async function settings(db: DB) {
	const rows = await db.select().from(schema.setting);
	const on = (key: string) => rows.find((r) => r.key === key)?.value === '1';
	return { autoApprove: on(AUTO_APPROVE) };
}

export const setSetting = (db: DB, key: string, on: boolean, userId: string) =>
	db
		.insert(schema.setting)
		.values({ key, value: on ? '1' : '0', setBy: userId, setAt: new Date() })
		.onConflictDoUpdate({
			target: schema.setting.key,
			set: { value: on ? '1' : '0', setBy: userId, setAt: new Date() }
		});

/** Just the one flag, for the claim path, which needs nothing else. */
export async function autoApproves(db: DB) {
	const [row] = await db
		.select({ value: schema.setting.value })
		.from(schema.setting)
		.where(eq(schema.setting.key, AUTO_APPROVE))
		.limit(1);
	return row?.value === '1';
}
