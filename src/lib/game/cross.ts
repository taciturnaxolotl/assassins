// Where two days touch.
//
// A day is not a line on a map, it is a series of places held for a while and
// walks between them, and only the places are known exactly. Nobody records
// when somebody left for class, only when the class starts, so a walk is a
// window rather than a moment: at the earliest they left the instant the last
// thing let out, at the latest they left just in time to arrive. Every node on
// the path inherits that window, narrowed by how far along it sits.
//
// Two people cross when they are within a short walk of the same spot with
// windows that overlap. That is a possibility and not a promise, which is why
// everything here is named for what it is: the wider the window, the more of it
// you would have to stand around for.

import type { Campus, Player } from './types';
import { PACE, type Walker } from './route';
import { dayOf, hhmm, place, type Slot } from './time';

/** One person, at one spot on the graph, for one stretch of the day. */
export type Where = {
	node: number;
	from: number;
	to: number;
	/** Passing through, as opposed to being somewhere for an hour. */
	moving: boolean;
	what: string;
};

const at = (c: Campus, n: number) => c.nodes[n];
const gap = (c: Campus, a: number, b: number) =>
	Math.hypot(at(c, a)[0] - at(c, b)[0], at(c, a)[1] - at(c, b)[1]);

/**
 * A player's day as a list of places and windows.
 *
 * The first walk of the day is the awkward one: nothing says when they left
 * their dorm, only when they had to arrive. So it is treated as leaving just in
 * time, which is the least generous reading and keeps the window honest rather
 * than smearing an ambush across the whole morning.
 */
export function presence(w: Walker, slots: Slot[], p: Player, day: number): Where[] {
	const c = w.campus;
	const plan = w.plan(slots, p, day);
	const out: Where[] = [];
	let freeAt: number | null = null;

	for (const stop of plan.stops) {
		const leg = stop.leg;
		if (leg && leg.path.length > 1) {
			const total = Math.max(1, leg.metres);
			// Leaving just in time, when nothing says otherwise.
			const left = freeAt ?? stop.s.from - total / PACE;
			let walked = 0;
			for (let i = 0; i < leg.path.length; i++) {
				if (i) walked += gap(c, leg.path[i - 1], leg.path[i]);
				const earliest = left + walked / PACE;
				const latest = stop.s.from - (total - walked) / PACE;
				out.push({
					node: leg.path[i],
					from: Math.min(earliest, latest),
					to: Math.max(earliest, latest),
					moving: true,
					what: `on the way to ${place(stop.s.m)}`
				});
			}
		}
		if (stop.node != null)
			out.push({
				node: stop.node,
				from: stop.s.from,
				to: stop.s.to,
				moving: false,
				what: `in ${place(stop.s.m)}`
			});
		freeAt = stop.s.to;
	}
	return out;
}

export type Crossing = {
	/** Where to stand, in metres on the same plane the map draws. */
	x: number;
	y: number;
	node: number;
	from: number;
	to: number;
	/** What each of you is doing while it happens. */
	mine: string;
	theirs: string;
	/** Neither of you is walking: you are both sat in the same place. */
	together: boolean;
	/** How long the window is. A short one is worth walking to. */
	minutes: number;
	near: string | null;
	/** Other players with class there at the time. Chapel is not an ambush. */
	others: number;
};

/** The building this spot belongs to, if it is close enough to name one. */
function nearest(c: Campus, node: number, within = 70) {
	let best: { name: string; d: number } | null = null;
	for (const [name, a] of Object.entries(c.anchors)) {
		const d = gap(c, node, a.node);
		if (d <= within && (!best || d < best.d)) best = { name, d };
	}
	return best?.name ?? null;
}

/**
 * Every spot where your day and theirs could put you in the same place.
 *
 * `radius` is how close counts as the same place: two people on either side of
 * a quad have not met, two people entering the same door have. Overlaps get
 * merged, because a shared corridor is one opportunity and not forty.
 */
export function crossings(
	w: Walker,
	slots: Slot[],
	me: Player,
	them: Player,
	day: number,
	radius = 40
): Crossing[] {
	if (me.gmId === them.gmId) return [];
	if (!dayOf(slots, me, day).length || !dayOf(slots, them, day).length) return [];

	const c = w.campus;
	const mine = presence(w, slots, me, day);
	const theirs = presence(w, slots, them, day);

	const hits: Crossing[] = [];
	for (const a of mine)
		for (const b of theirs) {
			const from = Math.max(a.from, b.from);
			const to = Math.min(a.to, b.to);
			if (to < from) continue;
			if (gap(c, a.node, b.node) > radius) continue;
			const [x, y] = at(c, a.node);
			hits.push({
				x,
				y,
				node: a.node,
				from,
				to,
				mine: a.what,
				theirs: b.what,
				together: !a.moving && !b.moving,
				minutes: Math.round(to - from),
				near: nearest(c, a.node),
				others: 0
			});
		}

	// One corridor walked together is one crossing, not forty.
	//
	// Only ever merge like with like. An hour sat in a lecture and the walk that
	// follows it are touching in time and near each other in space, but they are
	// two different opportunities, and folding them together reports a two hour
	// ambush window outside a building neither of you is in.
	//
	// Two hits count as the same place when they are close on the graph or hang
	// off the same building, which is how a person would say it: you wait
	// outside the library, not at node 1841.
	const merged: (Crossing & { seed: [number, number] })[] = [];
	for (const h of hits.sort((p, q) => p.from - q.from || p.to - q.to)) {
		const near = merged.find(
			(m) =>
				m.together === h.together &&
				(Math.hypot(m.x - h.x, m.y - h.y) <= radius * 2 || (!!m.near && m.near === h.near)) &&
				// Against the span the cluster started with, never the one it has
				// grown into: chaining on the grown span walks a five minute
				// tolerance clean across the afternoon.
				h.from <= m.seed[1] + 5 &&
				m.seed[0] <= h.to + 5
		);
		if (near) {
			near.from = Math.min(near.from, h.from);
			near.to = Math.max(near.to, h.to);
			near.minutes = Math.round(near.to - near.from);
			continue;
		}
		merged.push({ ...h, seed: [h.from, h.to] });
	}

	// Everybody is in chapel at ten. A place is only an opportunity if it is not
	// also where the rest of the game is standing, so the count comes along and
	// the reader can decide.
	for (const m of merged) {
		const there = new Set<string>();
		for (const s of slots) {
			if (s.day !== day || s.p.gmId === me.gmId || s.p.gmId === them.gmId) continue;
			if (s.to < m.from || m.to < s.from) continue;
			const n = w.anchor(s.m.building);
			if (n != null && gap(c, n, m.node) <= radius) there.add(s.p.gmId);
		}
		m.others = there.size;
	}

	return merged
		.map(({ seed: _seed, ...m }) => m)
		.sort((p, q) => p.from - q.from);
}

/** "9:50 to 10:05", or just "9:50" when the window is a moment. */
export const span = (c: Crossing) =>
	c.minutes < 2 ? hhmm(Math.round(c.from)) : `${hhmm(Math.round(c.from))} to ${hhmm(Math.round(c.to))}`;
