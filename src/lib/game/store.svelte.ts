// Everything a screen needs, derived once and shared through context.
//
// The server sends two things: the dossier it is willing to show you, and the
// ring as it currently stands. Everything else on this page — who is hunting
// whom, who is in class right now, where they will walk — falls out of those.

import { getContext, setContext } from 'svelte';
import type { Campus, ChainView, Player, Tier } from './types';
import { flatten, nextClass, type Slot } from './time';
import { Walker } from './route';
import { huntersOf, isDead, killsBy, runs, targetOf } from './chain';

export type RosterCard = {
	gmId: string;
	name: string;
	matched: boolean;
	avatar: { url: string; rotate: number } | null;
	photos: { url: string; rotate: number }[];
	class: string | null;
};

export type Payload = {
	term: string;
	tier: Tier;
	players: Player[];
	campus: Campus | null;
	roster: RosterCard[] | null;
	chain: ChainView;
	notes: Record<string, string>;
	me: string | null;
	isAdmin: boolean;
	isFreeAgent: boolean;
};

export class Game {
	term: string;
	tier = $state<Tier>('anon');
	players = $state<Player[]>([]);
	campus = $state<Campus | null>(null);
	roster = $state<RosterCard[]>([]);
	chain = $state<ChainView>({ assigned: {}, kills: {}, myTarget: null, claimedKill: null, won: false, full: false });
	notes = $state<Record<string, string>>({});
	me = $state<string | null>(null);
	isAdmin = false;

	/** Ticks every half minute so "in class right now" stays true. */
	now = $state(new Date());


	constructor(p: Payload) {
		this.term = p.term;
		this.absorb(p);
	}

	absorb(p: Payload) {
		this.tier = p.tier;
		this.players = p.players;
		this.campus = p.campus;
		this.roster = p.roster ?? p.players.map(card);
		this.chain = p.chain;
		this.notes = p.notes;
		this.me = p.me;
		this.isAdmin = p.isAdmin;
		this.isFreeAgent = p.isFreeAgent;
	}

	get unlocked() {
		return this.tier === 'pro';
	}

	byId = $derived(new Map(this.players.map((p) => [p.gmId, p])));
	names = $derived(new Map(this.roster.map((r) => [r.gmId, r.name])));
	slots = $derived<Slot[]>(flatten(this.players));
	walker = $derived(this.campus ? new Walker(this.campus) : null);
	alphabetical = $derived([...this.roster].sort((a, b) => a.name.localeCompare(b.name)));

	get living() {
		return this.roster.filter((r) => !this.dead(r.gmId)).length;
	}

	/** Signed in, in the game, and nobody on the roster: a contractor. */
	isFreeAgent = $state(false);

	/** A kill you have reported that nobody has confirmed yet. */
	get claimedKill() {
		return this.chain.claimedKill;
	}

	/** The ring has closed on you. */
	get won() {
		return this.chain.won;
	}

	get day() {
		return this.now.getDay();
	}
	get minutes() {
		return this.now.getHours() * 60 + this.now.getMinutes();
	}

	name = (id: string | null | undefined) => (id ? (this.names.get(id) ?? '—') : '—');

	/**
	 * Who someone is hunting. Only ever answerable about yourself, unless you
	 * run the game — the browser is not given the edges to work it out.
	 */
	target = (id: string) =>
		this.chain.full ? targetOf(this.chain, id) : id === this.me ? this.chain.myTarget : null;

	/** Whether this view can speak about the ring at all. */
	get seesRing() {
		return this.chain.full;
	}
	dead = (id: string | null | undefined) => isDead(this.chain, id);
	hunters = (id: string) => huntersOf(this.chain, this.players, id);
	scalps = (id: string) => killsBy(this.chain, id);
	runs = () => runs(this.chain);
	next = (p: Player) => nextClass(this.slots, p, this.now);

	get myTarget() {
		const t = this.chain.myTarget;
		return t ? (this.byId.get(t) ?? null) : null;
	}

	/** The whole point of the free tier: you know who, but not yet what. */
	get myTargetId() {
		return this.chain.myTarget;
	}

	// ─── mutations ──────────────────────────────────────────────────────────
	//
	// The ring is small, so the server hands the whole thing back on every edit
	// rather than trying to patch it in two places and keep them agreeing.

	async post(body: Record<string, unknown>) {
		const res = await fetch('/api/chain', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify(body)
		});
		if (!res.ok) {
			const said = (await res.json().catch(() => null)) as { message?: string } | null;
			throw new Error(said?.message ?? 'Refused.');
		}
		this.chain = await res.json();
	}

	assign = (hunterGmId: string, victimGmId: string | null) =>
		this.post({ action: 'assign', hunterGmId, victimGmId });

	kill = (victimGmId: string, killerGmId: string | null) =>
		this.post({ action: 'kill', victimGmId, killerGmId });

	revive = (victimGmId: string) => this.post({ action: 'revive', victimGmId });


	async note(gmId: string, body: string) {
		this.notes[gmId] = body;
		await fetch('/api/note', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ gmId, body })
		});
	}
}

const card = (p: Player): RosterCard => ({
	gmId: p.gmId,
	name: p.name,
	matched: p.matched,
	avatar: p.avatar,
	photos: p.photos.slice(0, 1),
	class: p.class ?? null
});

const KEY = Symbol('game');
export const provide = (g: Game) => setContext(KEY, g);
export const game = () => getContext<Game>(KEY);
