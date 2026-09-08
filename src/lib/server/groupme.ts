// Reading the kills and snipes topics.
//
// People announce kills in GroupMe long before anybody thinks to open this, so
// the announcements are the real record and the queue is better built from
// them than from waiting on both parties to remember.
//
// Two things shape how this reads them, both from the notes in
// ../group-me-not, which were taken off the decompiled Android client:
//
//   A topic is not a group for reading *about* — `GET /v3/groups/{topicId}`
//   is a 404 — but it is a group for reading *from*, and
//   `GET /v3/groups/{topicId}/messages` answers 200. There is no
//   subgroup-scoped message route; the topic id goes where a group id goes.
//
//   The kills topic is an `announcement` topic, so only admins and the owner
//   can post in it. The sender is therefore whoever announced the kill, not
//   whoever made it. Both names have to come out of the prose.
//
// Which is why nothing here writes a kill on its own. It finds the roster names
// in a message, guesses which is which, and hands the message to a person along
// with its guess. Parsing prose into game state is the sort of thing that is
// right nine times in ten and infuriating the tenth.
//
// Snipes are the other way round. The snipes topic is open, so the sender is
// the sniper, and the photograph is the point rather than the evidence. A snipe
// only has to say who is in the picture, so the common post is a name and an
// image and nothing else. That much is unambiguous enough to file on sight;
// anything with more words in it is a person making a claim, and goes to a
// human. See `readSnipe`.

import { eq, inArray } from 'drizzle-orm';
import type { DB } from './db';
import { schema } from './db';
import type { Env } from './auth';
import { roster } from './data';
import { loadChain } from './game';
import { targetOf } from '$lib/game/chain';

/** Without a token and a topic the feature is simply absent. */
export const enabled = (env: Env) => !!(env.GROUPME_TOKEN && env.GROUPME_KILLS_TOPIC);
export const snipesEnabled = (env: Env) => !!(env.GROUPME_TOKEN && env.GROUPME_SNIPES_TOPIC);

export type Message = {
	id: string;
	senderId: string;
	name: string;
	text: string;
	at: Date;
	/** The first image on the message, which in a kills topic is the proof. */
	image: string | null;
	/** GroupMe talking about the conversation rather than somebody in it. */
	system: boolean;
};

async function fetchMessages(env: Env, topic: string, limit = 60): Promise<Message[]> {
	const url = new URL(`https://api.groupme.com/v3/groups/${topic}/messages`);
	url.searchParams.set('limit', String(limit));
	// Omit this and attachments come back stripped. Undocumented; from the
	// decompiled client.
	url.searchParams.set('acceptFiles', '1');

	const res = await fetch(url, { headers: { 'X-Access-Token': env.GROUPME_TOKEN! } });
	if (!res.ok)
		throw new Error(
			res.status === 404
				? 'GroupMe says no such topic. Check the topic id is the topic, not the parent group.'
				: `GroupMe answered ${res.status}.`
		);

	const body = (await res.json().catch(() => null)) as {
		response?: { messages?: Record<string, unknown>[] };
	} | null;

	return (body?.response?.messages ?? [])
		.filter((m) => m.created_at)
		.map((m) => ({
			// Topic ids come back as numbers where every other id is a string.
			id: String(m.id),
			senderId: String(m.user_id ?? ''),
			name: String(m.name ?? ''),
			text: String(m.text ?? ''),
			// "X edited to: …", "A message was deleted", "X changed the topic's
			// type". These quote the announcement they are about, so they read as
			// a second copy of a kill that has already been dealt with — and one
			// of them proposed the announcer as the victim, because his name was
			// in the notice about his own post.
			system: m.sender_type === 'system' || String(m.name ?? '') === 'GroupMe',
			at: new Date(Number(m.created_at) * 1000),
			image:
				((m.attachments as { type?: string; url?: string }[] | undefined) ?? []).find(
					(a) => a.type === 'image' && a.url
				)?.url ?? null
		}));
}

// ─── reading a message ──────────────────────────────────────────────────────

/**
 * Every roster player the message names, in the order they appear.
 *
 * Longest match wins where two overlap, so "Anna Grace Gage" beats the "Anna"
 * inside it. A bare first name only counts when exactly one player answers to
 * it — there are two Silases in this game, and guessing between them is worse
 * than not guessing.
 */
function namesIn(text: string, cards: { gmId: string; name: string }[]) {
	const hay = text.toLowerCase();
	const hits: { gmId: string; at: number; len: number }[] = [];

	for (const c of cards) {
		const at = hay.indexOf(c.name.toLowerCase());
		if (at !== -1) hits.push({ gmId: c.gmId, at, len: c.name.length });
	}

	const firsts = new Map<string, string[]>();
	for (const c of cards) {
		const f = c.name.split(/\s+/)[0].toLowerCase();
		firsts.set(f, [...(firsts.get(f) ?? []), c.gmId]);
	}
	for (const [first, ids] of firsts) {
		if (ids.length !== 1) continue;
		const at = hay.search(new RegExp(`\\b${first}\\b`));
		if (at !== -1) hits.push({ gmId: ids[0], at, len: first.length });
	}

	// Drop anything sitting inside a longer match, then read left to right.
	const kept = hits
		.sort((a, b) => b.len - a.len)
		.filter((h, i, all) => !all.slice(0, i).some((o) => h.at >= o.at && h.at + h.len <= o.at + o.len));

	return [...new Map(kept.sort((a, b) => a.at - b.at).map((h) => [h.gmId, h])).values()].map(
		(h) => h.gmId
	);
}

/** Levenshtein, but it stops caring past `max`. Nothing here needs the number. */
function near(a: string, b: string, max = 1) {
	if (a === b) return 0;
	if (Math.abs(a.length - b.length) > max) return max + 1;
	let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
	for (let i = 1; i <= a.length; i++) {
		const row = [i];
		let best = i;
		for (let j = 1; j <= b.length; j++) {
			row[j] = Math.min(
				prev[j] + 1,
				row[j - 1] + 1,
				prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
			);
			best = Math.min(best, row[j]);
		}
		if (best > max) return max + 1;
		prev = row;
	}
	return prev[b.length];
}

/**
 * Ranked guesses, for when the message will not resolve to one person.
 *
 * `namesIn` is deliberately unwilling: it would rather say nothing than pick
 * the wrong Silas. That is right for filling a field in and useless for the
 * person reading the queue, who then has to search a roster of seventy-nine by
 * hand. So the same text gets read a second way, generously, and whatever it
 * turns up is offered rather than applied.
 *
 * Three real announcements from this game's kills topic, none of which `namesIn`
 * would touch:
 *
 *   "Obituary: I died - Silas 2026" — two Silases on the roster.
 *   "-Jason Lossman"               — the roster spells it Lossmann.
 *   "In Memoriam: Gabriel Sanderson II" — not on the roster at all, and
 *                                        nothing is the honest answer.
 */
export function candidatesIn(text: string, cards: { gmId: string; name: string }[]) {
	const words: string[] = text.toLowerCase().match(/[\p{L}']+/gu) ?? [];
	if (!words.length) return [];
	const hay = text.toLowerCase();

	const out: { gmId: string; name: string; why: string; score: number }[] = [];
	for (const c of cards) {
		const parts = c.name.toLowerCase().split(/\s+/).filter(Boolean);
		const first = parts[0] ?? '';
		const last = parts.length > 1 ? parts[parts.length - 1] : '';
		let score = 0;
		let why = '';

		if (hay.includes(c.name.toLowerCase())) {
			score = 100;
			why = 'named in full';
		} else {
			if (last) {
				if (words.includes(last)) {
					score += 50;
					why = 'surname';
				} else if (words.some((v) => v.length > 3 && near(v, last) <= 1)) {
					score += 40;
					why = 'surname, spelled differently';
				}
			}
			if (first) {
				if (words.includes(first)) {
					score += 12;
					why = why || 'first name';
				} else if (words.some((v) => v.length > 2 && near(v, first) <= 1)) {
					score += 8;
					why = why || 'first name, spelled differently';
				}
			}
		}
		if (score > 0) out.push({ gmId: c.gmId, name: c.name, why, score });
	}

	return out.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name)).slice(0, 5);
}

export type Proposal = {
	messageId: string;
	at: Date;
	text: string;
	announcedBy: string;
	/** Posted with the announcement: the photograph of it being done. */
	image: string | null;
	killerGmId: string | null;
	victimGmId: string | null;
	/** How much to trust the guess, said plainly. */
	basis: string;
	/** Offered, never applied: who this might be about. */
	picks: { gmId: string; name: string; why: string }[];
};

export async function killProposals(db: DB, env: Env): Promise<Proposal[]> {
	if (!enabled(env)) return [];

	const [messages, cards, chain] = await Promise.all([
		fetchMessages(env, env.GROUPME_KILLS_TOPIC!),
		roster(db),
		loadChain(db)
	]);

	const byGmId = new Map(cards.map((c) => [c.gmId, c]));
	const seen = new Set(
		messages.length
			? (
					await db
						.select({ id: schema.groupmeSeen.messageId })
						.from(schema.groupmeSeen)
						.where(inArray(schema.groupmeSeen.messageId, messages.map((m) => m.id)))
				).map((r) => r.id)
			: []
	);
	const dead = new Set(Object.keys(chain.kills));

	const out: Proposal[] = [];
	for (const m of messages) {
		if (seen.has(m.id) || m.system) continue;

		const named = namesIn(m.text, cards);
		// A bare photograph with no name in it is still worth showing: somebody
		// can say who it is.
		if (!named.length && !m.image) continue;

		let killerGmId: string | null = null;
		let victimGmId: string | null = null;
		let basis: string;

		if (named.length >= 2) {
			// Announcements read "X got Y" far more often than the reverse.
			[killerGmId, victimGmId] = named;
			basis = 'two names, in the order they appear';
		} else if (named.length === 1) {
			// One name. The ring says who was hunting them, which is a better
			// guess than anything the sentence can offer.
			victimGmId = named[0];
			const hunter = cards.find((c) => targetOf(chain, c.gmId) === victimGmId);
			killerGmId = hunter?.gmId ?? null;
			basis = hunter
				? 'one name; the ring says who was hunting them'
				: 'one name, and nothing says who got them';
		} else {
			// Nothing it would commit to. Saying "one name" here was a lie the
			// queue told about itself for a while.
			victimGmId = null;
			basis = 'no roster name it would commit to';
		}

		if (victimGmId && dead.has(victimGmId)) continue;

		out.push({
			messageId: m.id,
			at: m.at,
			text: m.text.slice(0, 300),
			announcedBy: m.name,
			image: m.image,
			killerGmId,
			victimGmId,
			basis,
			// Only worth offering where the confident read came up short.
			picks: victimGmId ? [] : candidatesIn(m.text, cards)
		});
	}

	return out.sort((a, b) => b.at.getTime() - a.at.getTime());
}

export const markSeen = (
	db: DB,
	messageId: string,
	outcome: string,
	userId: string | null,
	kind = 'kill'
) =>
	db
		.insert(schema.groupmeSeen)
		.values({ messageId, kind, outcome, decidedBy: userId, decidedAt: new Date() })
		.onConflictDoUpdate({
			target: schema.groupmeSeen.messageId,
			set: { outcome, decidedBy: userId, decidedAt: new Date() }
		});

// ─── snipes ─────────────────────────────────────────────────────────────────

export type Snipe = {
	messageId: string;
	at: Date;
	text: string;
	/** The snipes topic is open, so the sender really is the sniper. */
	sniper: string;
	image: string;
	gmId: string | null;
	/** Whether this filed itself, and on what grounds. */
	filed: boolean;
	basis: string;
};

/**
 * Who a snipe says it is of, when it says nothing else.
 *
 * The whole text has to be the name. A leading or trailing dash is the one
 * flourish allowed, because "- Noelle Batcheller" is how half the group signs a
 * photograph. Everything past that — a verb, a second name, an @mention, a
 * word of gloating — means somebody is making a claim rather than labelling a
 * picture, and claims go to a person.
 *
 * A bare first name counts only when exactly one player answers to it. There
 * are two Silases in this game.
 */
function soleName(text: string, cards: { gmId: string; name: string }[]) {
	const bare = text
		.replace(/^[\s\p{Pd}]+/u, '')
		.replace(/[\s\p{Pd}.!]+$/u, '')
		.toLowerCase();
	if (!bare) return null;

	const full = cards.filter((c) => c.name.toLowerCase() === bare);
	if (full.length === 1) return full[0].gmId;

	const first = cards.filter((c) => c.name.split(/\s+/)[0].toLowerCase() === bare);
	return first.length === 1 ? first[0].gmId : null;
}

/** Read the snipes topic. Anything without a photograph is chatter, not a snipe. */
export async function readSnipes(db: DB, env: Env): Promise<Snipe[]> {
	if (!snipesEnabled(env)) return [];

	const [messages, cards] = await Promise.all([
		fetchMessages(env, env.GROUPME_SNIPES_TOPIC!),
		roster(db)
	]);

	const seen = new Set(
		messages.length
			? (
					await db
						.select({ id: schema.groupmeSeen.messageId })
						.from(schema.groupmeSeen)
						.where(inArray(schema.groupmeSeen.messageId, messages.map((m) => m.id)))
				).map((r) => r.id)
			: []
	);

	const out: Snipe[] = [];
	for (const m of messages) {
		if (seen.has(m.id) || m.system || !m.image) continue;

		const sole = soleName(m.text, cards);
		if (sole)
			out.push({
				messageId: m.id,
				at: m.at,
				text: m.text,
				sniper: m.name,
				image: m.image,
				gmId: sole,
				filed: true,
				basis: 'a name and a photograph, and nothing else to read'
			});
		else {
			// Still worth a guess for whoever looks at it, but only a guess.
			const named = namesIn(m.text, cards);
			out.push({
				messageId: m.id,
				at: m.at,
				text: m.text,
				sniper: m.name,
				image: m.image,
				gmId: named[0] ?? null,
				filed: false,
				basis: !m.text.trim()
					? 'a photograph with nothing said about it'
					: named.length === 1
						? 'one name, said among other things'
						: named.length > 1
							? `${named.length} names in one message`
							: 'nothing in it matches the roster'
			});
		}
	}

	return out.sort((a, b) => b.at.getTime() - a.at.getTime());
}

/** File a snipe photograph against the person it is of. */
export async function keepSnipe(
	db: DB,
	snipe: { messageId: string; gmId: string; image: string },
	userId: string | null,
	auto = false
) {
	await db
		.insert(schema.extraPhoto)
		.values({
			id: `snipe:${snipe.messageId}`,
			gmId: snipe.gmId,
			url: snipe.image,
			source: 'snipes topic',
			addedBy: userId,
			addedAt: new Date()
		})
		.onConflictDoNothing();
	await markSeen(db, snipe.messageId, auto ? 'auto' : 'confirmed', userId, 'snipe');
}

/** Undo one, whoever filed it, so an automatic mistake is one click deep. */
export async function dropSnipe(db: DB, messageId: string) {
	await db.delete(schema.extraPhoto).where(eq(schema.extraPhoto.id, `snipe:${messageId}`));
	await db.delete(schema.groupmeSeen).where(eq(schema.groupmeSeen.messageId, messageId));
}

/**
 * Read the topic, file the unambiguous ones, hand back the rest.
 *
 * Filing on sight is only defensible because the bar is so high: the message
 * has to be a roster name and a photograph and nothing besides. Everything that
 * clears it is reversible with `dropSnipe`.
 */
export async function syncSnipes(db: DB, env: Env, userId: string | null) {
	const all = await readSnipes(db, env);
	const filed = all.filter((s) => s.filed && s.gmId);
	for (const s of filed) await keepSnipe(db, { ...s, gmId: s.gmId! }, userId, true);
	return { filed, queued: all.filter((s) => !s.filed) };
}
