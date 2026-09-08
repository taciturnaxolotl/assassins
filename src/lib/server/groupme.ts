// Reading the kills topic.
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

import { inArray } from 'drizzle-orm';
import type { DB } from './db';
import { schema } from './db';
import type { Env } from './auth';
import { roster } from './data';
import { loadChain } from './game';
import { targetOf } from '$lib/game/chain';

/** Without a token and a topic the whole feature is simply absent. */
export const enabled = (env: Env) => !!(env.GROUPME_TOKEN && env.GROUPME_KILLS_TOPIC);

export type Message = { id: string; senderId: string; name: string; text: string; at: Date };

async function fetchMessages(env: Env, limit = 60): Promise<Message[]> {
	const url = new URL(
		`https://api.groupme.com/v3/groups/${env.GROUPME_KILLS_TOPIC}/messages`
	);
	url.searchParams.set('limit', String(limit));

	const res = await fetch(url, { headers: { 'X-Access-Token': env.GROUPME_TOKEN! } });
	if (!res.ok)
		throw new Error(
			res.status === 404
				? 'GroupMe says no such topic. Check GROUPME_KILLS_TOPIC is the topic id, not the parent group.'
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
			at: new Date(Number(m.created_at) * 1000)
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

export type Proposal = {
	messageId: string;
	at: Date;
	text: string;
	announcedBy: string;
	killerGmId: string | null;
	victimGmId: string | null;
	/** How much to trust the guess, said plainly. */
	basis: string;
};

export async function killProposals(db: DB, env: Env): Promise<Proposal[]> {
	if (!enabled(env)) return [];

	const [messages, cards, chain] = await Promise.all([
		fetchMessages(env),
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
		if (seen.has(m.id)) continue;

		const named = namesIn(m.text, cards);
		if (!named.length) continue;

		let killerGmId: string | null = null;
		let victimGmId: string | null = null;
		let basis: string;

		if (named.length >= 2) {
			// Announcements read "X got Y" far more often than the reverse.
			[killerGmId, victimGmId] = named;
			basis = 'two names, in the order they appear';
		} else {
			// One name. The ring says who was hunting them, which is a better
			// guess than anything the sentence can offer.
			victimGmId = named[0];
			const hunter = cards.find((c) => targetOf(chain, c.gmId) === victimGmId);
			killerGmId = hunter?.gmId ?? null;
			basis = hunter ? 'one name; the ring says who was hunting them' : 'one name, and nothing says who got them';
		}

		if (victimGmId && dead.has(victimGmId)) continue;

		out.push({
			messageId: m.id,
			at: m.at,
			text: m.text.slice(0, 300),
			announcedBy: m.name,
			killerGmId,
			victimGmId,
			basis
		});
	}

	return out.sort((a, b) => b.at.getTime() - a.at.getTime());
}

export const markSeen = (db: DB, messageId: string, outcome: string, userId: string) =>
	db
		.insert(schema.groupmeSeen)
		.values({ messageId, outcome, decidedBy: userId, decidedAt: new Date() })
		.onConflictDoUpdate({
			target: schema.groupmeSeen.messageId,
			set: { outcome, decidedBy: userId, decidedAt: new Date() }
		});
