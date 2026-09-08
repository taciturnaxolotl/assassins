// The ring is two facts, and everything else is derived from them.
//
//   assigned[hunter] = victim   the original draw
//   kills[victim]    = killer   who took them out ("" when nobody has claimed it)
//
// A killer inherits their victim's target, so a live hunter's current target is
// their assignment walked forward past however many corpses are in the way.
// That walk *is* the inheritance rule, stated once. There is no reassignment
// step to keep in sync, which is why nothing can drift.
//
// Free agents do not appear here at all. They are outside the ring rather than
// removed from it, so there is nothing for the walk to step over.

import type { Chain, Player } from './types';

export const isDead = (c: Chain, id: string | null | undefined) => !!id && id in c.kills;

/** The end of the walk: whoever is left standing in front of you. */
function walk(c: Chain, id: string) {
	const seen = new Set([id]);
	let t: string | undefined = c.assigned[id];
	while (t && isDead(c, t) && !seen.has(t)) {
		seen.add(t);
		t = c.assigned[t];
	}
	return t && !isDead(c, t) ? t : null;
}

export function targetOf(c: Chain, id: string): string | null {
	if (isDead(c, id)) return null;
	const t = walk(c, id);
	// The walk coming back around to you means everyone between you and
	// yourself is dead, which is the last move of the game rather than an
	// instruction to hunt yourself.
	return t === id ? null : t;
}

/** The ring has closed on one person. They have won. */
export const hasWon = (c: Chain, id: string) =>
	!isDead(c, id) && walk(c, id) === id;

export const huntersOf = (c: Chain, players: Player[], id: string) =>
	players.filter((p) => !isDead(c, p.gmId) && targetOf(c, p.gmId) === id);

export const killsBy = (c: Chain, id: string) =>
	Object.entries(c.kills)
		.filter(([, k]) => k === id)
		.map(([v]) => v);

// Follow the assignment edges into runs. Whoever nobody points at starts a run;
// anything left over after that is a closed loop, which is what a whole ring is.
export function runs(c: Chain): (string | null)[][] {
	const pointedAt = new Set(Object.values(c.assigned));
	const out: (string | null)[][] = [];
	const used = new Set<string>();
	const walk = (start: string) => {
		const run: string[] = [];
		for (let id: string | undefined = start; id && !used.has(id); id = c.assigned[id]) {
			used.add(id);
			run.push(id);
		}
		return run;
	};
	for (const id of Object.keys(c.assigned)) if (!pointedAt.has(id)) out.push(walk(id));
	// null marks a run that bites its own tail.
	for (const id of Object.keys(c.assigned)) if (!used.has(id)) out.push([...walk(id), null]);
	return out.sort((a, b) => b.length - a.length);
}
