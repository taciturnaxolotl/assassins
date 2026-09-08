// The campus as a walking graph.
//
// Buildings and footpaths come out of the build already projected to a local
// flat plane in metres, so a route is the same numbers whether you are looking
// at the whole village or one courtyard. Routing happens here rather than at
// build time so the map can answer any pair of rooms, not just ones we thought
// to precompute.

import type { Campus, Player } from './types';
import { dayOf, type Slot } from './time';

export const PACE = 84; // metres a minute, walking like you have somewhere to be

export type Leg = { path: number[]; metres: number; minutes: number; gap: number | null };
export type Stop = { s: Slot; node: number | null; leg?: Leg };
export type Plan = { stops: Stop[]; home: number | null; homeless: boolean; located: Stop[] };

export class Walker {
	readonly campus: Campus;
	private adj: [number, number][][];
	private cache = new Map<string, { path: number[]; metres: number }>();

	constructor(campus: Campus) {
		this.campus = campus;
		this.adj = campus.nodes.map(() => [] as [number, number][]);
		for (const [a, b, w] of campus.edges) {
			this.adj[a].push([b, w]);
			this.adj[b].push([a, w]);
		}
	}

	anchor(name: string | null | undefined) {
		return name && this.campus.anchors[name] ? this.campus.anchors[name].node : null;
	}

	// Dijkstra with a binary heap. Two thousand nodes, so this is instant, and
	// caching a route is cheaper than being clever about it.
	route(from: number, to: number) {
		if (from === to) return { path: [from], metres: 0 };
		const key = from + ':' + to;
		const hit = this.cache.get(key);
		if (hit) return hit;

		const n = this.campus.nodes.length;
		const dist = new Float64Array(n).fill(Infinity);
		const prev = new Int32Array(n).fill(-1);
		const heap: [number, number][] = [[0, from]];
		dist[from] = 0;

		const pop = () => {
			const top = heap[0];
			const last = heap.pop()!;
			if (heap.length) {
				heap[0] = last;
				for (let i = 0; ; ) {
					let s = i;
					for (const c of [2 * i + 1, 2 * i + 2])
						if (c < heap.length && heap[c][0] < heap[s][0]) s = c;
					if (s === i) break;
					[heap[i], heap[s]] = [heap[s], heap[i]];
					i = s;
				}
			}
			return top;
		};
		const push = (item: [number, number]) => {
			heap.push(item);
			for (let i = heap.length - 1; i > 0; ) {
				const p = (i - 1) >> 1;
				if (heap[p][0] <= heap[i][0]) break;
				[heap[i], heap[p]] = [heap[p], heap[i]];
				i = p;
			}
		};

		while (heap.length) {
			const [d, u] = pop();
			if (u === to) break;
			if (d > dist[u]) continue;
			for (const [v, w] of this.adj[u])
				if (d + w < dist[v]) {
					dist[v] = d + w;
					prev[v] = u;
					push([dist[v], v]);
				}
		}

		const path: number[] = [];
		let metres = 0;
		for (let at = to; at !== -1; at = prev[at]) {
			path.unshift(at);
			if (prev[at] !== -1) {
				const [ax, ay] = this.campus.nodes[at];
				const [bx, by] = this.campus.nodes[prev[at]];
				metres += Math.hypot(ax - bx, ay - by);
			}
		}
		const result = { path, metres: Math.round(metres) };
		this.cache.set(key, result);
		return result;
	}

	// A player's day as an ordered list of places they will be, each carrying
	// the walk that gets them there when we know both ends. Stops matter on
	// their own: someone with one class, or two in the same building, does no
	// walking all day and is still somewhere specific at a specific minute.
	plan(slots: Slot[], p: Player, day: number): Plan {
		const stops: Stop[] = dayOf(slots, p, day).map((s) => ({
			s,
			node: this.anchor(s.m.building)
		}));
		const home = this.anchor(p.dorm);

		let fromNode = home;
		let freeAt: number | null = null; // when the previous stop lets out
		for (const stop of stops) {
			if (stop.node != null && fromNode != null && fromNode !== stop.node) {
				const r = this.route(fromNode, stop.node);
				stop.leg = {
					...r,
					minutes: Math.max(1, Math.round(r.metres / PACE)),
					gap: freeAt == null ? null : stop.s.from - freeAt
				};
			}
			if (stop.node != null) fromNode = stop.node;
			freeAt = stop.s.to;
		}

		return {
			stops,
			home,
			homeless: !!p.dorm && home == null,
			located: stops.filter((x) => x.node != null)
		};
	}
}

export const slack = (leg: Leg | undefined) =>
	leg?.gap == null ? null : leg.gap - leg.minutes;
