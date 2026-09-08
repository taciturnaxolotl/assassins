import { sqliteTable, text, integer, primaryKey } from 'drizzle-orm/sqlite-core';
import type { Candidate, Course, Shot } from '$lib/game/types';

// ─── accounts ───────────────────────────────────────────────────────────────

export const user = sqliteTable('user', {
	id: text('id').primaryKey(),
	// Google's stable subject id. Emails get reassigned when students graduate;
	// this does not.
	googleSub: text('google_sub').notNull().unique(),
	name: text('name').notNull(),
	email: text('email').notNull().unique(),
	image: text('image'),
	// The local part of a @cedarville.edu address, which is also the directory's
	// Username column. This is the whole join between a Google account and a
	// student id, so it is stamped once at sign-in and never guessed again.
	username: text('username'),
	role: text('role').notNull().default('player'),
	createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
	updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull()
});

export const session = sqliteTable('session', {
	// The sha-256 of the cookie's token, never the token itself, so a copy of
	// this table is not a pile of working sessions.
	id: text('id').primaryKey(),
	userId: text('user_id')
		.notNull()
		.references(() => user.id, { onDelete: 'cascade' }),
	expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(),
	createdAt: integer('created_at', { mode: 'timestamp' }).notNull()
});

// ─── the game ───────────────────────────────────────────────────────────────

// Who a signed-in account says they are in the GroupMe. One row per account;
// an approved row is the only thing that binds a person to a player.
export const claim = sqliteTable('claim', {
	userId: text('user_id')
		.primaryKey()
		.references(() => user.id, { onDelete: 'cascade' }),
	// Null means somebody outside the ring: approved to sign in, but nobody on
	// the roster. The claim form no longer offers it — it existed for the
	// contract board — so the only rows like this are from before that went.
	gmId: text('gm_id'),
	status: text('status').notNull().default('pending'), // pending | approved | denied
	// Why the applicant says it is them, and why you decided what you decided.
	pitch: text('pitch'),
	verdict: text('verdict'),
	decidedBy: text('decided_by'),
	decidedAt: integer('decided_at', { mode: 'timestamp' }),
	createdAt: integer('created_at', { mode: 'timestamp' }).notNull()
});

// The ring, still stated as two facts. Each player reports their own edge, so
// the chain assembles itself instead of being kept by one person by hand.
export const assignment = sqliteTable('assignment', {
	hunterGmId: text('hunter_gm_id').primaryKey(),
	victimGmId: text('victim_gm_id').notNull(),
	reportedBy: text('reported_by').references(() => user.id, { onDelete: 'set null' }),
	createdAt: integer('created_at', { mode: 'timestamp' }).notNull()
});

// killerGmId is null when someone is known to be out but nobody has claimed it.
export const kill = sqliteTable('kill', {
	victimGmId: text('victim_gm_id').primaryKey(),
	killerGmId: text('killer_gm_id'),
	reportedBy: text('reported_by').references(() => user.id, { onDelete: 'set null' }),
	confirmed: integer('confirmed', { mode: 'boolean' }).notNull().default(false),
	createdAt: integer('created_at', { mode: 'timestamp' }).notNull()
});

// Private. Yours on someone, nobody else's business.
export const note = sqliteTable(
	'note',
	{
		userId: text('user_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		gmId: text('gm_id').notNull(),
		body: text('body').notNull(),
		updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull()
	},
	(t) => [primaryKey({ columns: [t.userId, t.gmId] })]
);

// ─── the dossier ────────────────────────────────────────────────────────────
//
// The join lives here rather than in the bundle, so resolving one of the seven
// unidentified players, or fixing a name, is a row update instead of a deploy.
// The nested parts stay JSON: we only ever hand a whole player back, so
// splitting schedules into tables would be normalising in order to spend a join
// reassembling exactly what we stored.

export const player = sqliteTable('player', {
	gmId: text('gm_id').primaryKey(),
	name: text('name').notNull(),
	avatar: text('avatar', { mode: 'json' }).$type<Shot | null>(),
	photos: text('photos', { mode: 'json' }).$type<Shot[]>().notNull(),
	/** The gallery on their GroupMe profile, if they have set one up. */
	gallery: text('gallery', { mode: 'json' }).$type<Shot[]>().notNull().default([]),
	matched: integer('matched', { mode: 'boolean' }).notNull(),
	candidates: text('candidates', { mode: 'json' }).$type<Candidate[] | null>(),

	studentId: text('student_id'),
	username: text('username'),
	legalName: text('legal_name'),
	class: text('class'),
	dorm: text('dorm'),
	room: text('room'),
	gender: text('gender'),
	hometown: text('hometown'),
	directoryPhoto: text('directory_photo', { mode: 'json' }).$type<Shot | null>(),
	majors: text('majors', { mode: 'json' }).$type<{ major: string; score: number }[] | null>(),
	schedule: text('schedule', { mode: 'json' }).$type<Course[] | null>()
});

// Term, group, and the campus graph: one blob each, read whole or not at all.
export const dataset = sqliteTable('dataset', {
	key: text('key').primaryKey(),
	value: text('value', { mode: 'json' }).notNull(),
	builtAt: integer('built_at', { mode: 'timestamp' }).notNull()
});

// Photographs added while the game is running, kept apart from `player` because
// that table is rewritten wholesale every time the join is rebuilt. A death
// photo posted in the kills topic would not survive one `bun run data`.
export const extraPhoto = sqliteTable('extra_photo', {
	id: text('id').primaryKey(),
	gmId: text('gm_id').notNull(),
	url: text('url').notNull(),
	/** Where it came from, so it can be labelled and undone. */
	source: text('source').notNull(),
	addedBy: text('added_by').references(() => user.id, { onDelete: 'set null' }),
	addedAt: integer('added_at', { mode: 'timestamp' }).notNull()
});

// A message from one of the read topics that somebody has already dealt with,
// so it stops being proposed. Kept even when ignored — otherwise every sync
// offers the same message somebody has already looked at and said no to.
export const groupmeSeen = sqliteTable('groupme_seen', {
	messageId: text('message_id').primaryKey(),
	/** Which topic it was read from: kill | snipe. */
	kind: text('kind').notNull().default('kill'),
	outcome: text('outcome').notNull(), // confirmed | ignored | auto
	decidedBy: text('decided_by').references(() => user.id, { onDelete: 'set null' }),
	decidedAt: integer('decided_at', { mode: 'timestamp' }).notNull()
});

// Settings a person changes while the game runs. Deliberately not `dataset`:
// the build empties that table on every run, and a switch somebody threw should
// not come back on because the roster was rebuilt.
export const setting = sqliteTable('setting', {
	key: text('key').primaryKey(),
	value: text('value').notNull(),
	setBy: text('set_by').references(() => user.id, { onDelete: 'set null' }),
	setAt: integer('set_at', { mode: 'timestamp' }).notNull()
});
