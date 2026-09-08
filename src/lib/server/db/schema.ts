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
	// Kept current by the Polar webhook so gating never costs a round trip.
	plan: text('plan').notNull().default('free'),
	planUntil: integer('plan_until', { mode: 'timestamp' }),
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
	// Null means a free agent: somebody outside the ring who signs in to work
	// contracts and is nobody on the roster.
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

// ─── the market ─────────────────────────────────────────────────────────────
//
// Contracts.
//
// Nothing here is denominated in money. What changes hands is a thing — a bag
// of sour candy, a textbook you are done with, a week of someone's dish duty —
// so it is written down rather than counted. Escrow is a person: whoever is
// physically holding the goods until the job is finished. That makes the word
// mean what it says on a campus, where nobody can hold anyone's money anyway.

// A job on the board. You may post one on the person you are hunting, naming
// what it is worth and how you intend to settle.
export const contract = sqliteTable('contract', {
	id: text('id').primaryKey(),
	markGmId: text('mark_gm_id').notNull(),
	posterUserId: text('poster_user_id')
		.notNull()
		.references(() => user.id, { onDelete: 'cascade' }),
	posterGmId: text('poster_gm_id').notNull(),
	/** What is on the table, in words. "Half a box of Cheez-Its." */
	offer: text('offer').notNull(),
	/** What the two of them actually shook on, once a bid is accepted. */
	agreed: text('agreed'),
	/**
	 * Who is holding the goods until it is done. Null means straight handover on
	 * completion, and trusting each other about it.
	 */
	heldBy: text('held_by'),
	terms: text('terms'),
	status: text('status').notNull().default('open'), // open | taken | done | cancelled
	takenByUserId: text('taken_by_user_id').references(() => user.id, { onDelete: 'set null' }),
	takenByGmId: text('taken_by_gm_id'),
	takenAt: integer('taken_at', { mode: 'timestamp' }),
	// Both sides say the goods changed hands before it is finished.
	posterSettled: integer('poster_settled', { mode: 'boolean' }).notNull().default(false),
	hitmanSettled: integer('hitman_settled', { mode: 'boolean' }).notNull().default(false),
	closedAt: integer('closed_at', { mode: 'timestamp' }),
	createdAt: integer('created_at', { mode: 'timestamp' }).notNull()
});

export const bid = sqliteTable(
	'bid',
	{
		contractId: text('contract_id')
			.notNull()
			.references(() => contract.id, { onDelete: 'cascade' }),
		hitmanUserId: text('hitman_user_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		// Null for a free agent, who is nobody on the roster.
		hitmanGmId: text('hitman_gm_id'),
		/** What they want for it. Not necessarily what was offered. */
		ask: text('ask').notNull(),
		pitch: text('pitch'),
		createdAt: integer('created_at', { mode: 'timestamp' }).notNull()
	},
	(t) => [primaryKey({ columns: [t.contractId, t.hitmanUserId] })]
);
