// A person who does not exist, walking a week that never happened.
//
// The landing page has to show the thing rather than describe it, and the thing
// is a route across campus. Everything here is invented: the name, the sections,
// the times. The only real ingredient is the campus itself, which is
// OpenStreetMap and public. Nothing about a student leaves this file, because
// there is nothing about a student in it.

import type { Campus, Course, Player } from '$lib/game/types';

// The oldest placeholder there is, and the point of using it: nobody can
// mistake this for a real student, which a plausible invented name might be.
const NAME = 'John Doe';
const DEPT = ['BTGE', 'ENGR', 'MATH', 'HIST', 'CHEM', 'PHYS', 'COMM', 'PSYC', 'MUSC'];
const TITLE = [
	'Discreet Structures', 'Introduction to Ballistics', 'Rhetoric of the Alibi',
	'Applied Patience', 'Organic Chemistry II', 'Statics and Dynamics',
	'The Long Nineteenth Century', 'Counterpoint', 'Cognitive Psychology'
];
// Real Cedarville class blocks, so the gaps between them read as plausible.
const BLOCKS = [
	['8:00 AM', '8:50 AM'],
	['9:00 AM', '9:50 AM'],
	['10:00 AM', '10:50 AM'],
	['11:00 AM', '11:50 AM'],
	['1:00 PM', '1:50 PM'],
	['2:00 PM', '2:50 PM'],
	['3:00 PM', '3:50 PM'],
	['4:00 PM', '4:50 PM']
];

/**
 * A small deterministic generator, so the same seed always invents the same
 * day. The preview behind the paywall has to hold still: a fake schedule that
 * reshuffles on every reload reads as a glitch rather than a sample.
 */
function rng(seed: string) {
	let h = 2166136261;
	for (let i = 0; i < seed.length; i++) {
		h ^= seed.charCodeAt(i);
		h = Math.imul(h, 16777619);
	}
	return () => {
		h += 0x6d2b79f5;
		let t = h;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

/**
 * Invent a week plausible enough to draw. The person is openly nobody.
 *
 * A seed makes it repeatable. Pass one wherever the same invented week has to
 * come back the same way twice; leave it off and every call is a fresh one.
 */
export function inventPlayer(campus: Campus, seed?: string): Player {
	const random = seed ? rng(seed) : Math.random;
	const pick = <T,>(xs: T[]) => xs[Math.floor(random() * xs.length)];
	const some = <T,>(xs: T[], n: number) => {
		const pool = [...xs];
		const out: T[] = [];
		while (out.length < n && pool.length)
			out.push(...pool.splice(Math.floor(random() * pool.length), 1));
		return out;
	};

	// Only buildings the map can actually anchor, or the route has nothing to
	// join up and the demo shows an empty campus.
	const anchored = Object.keys(campus.anchors);
	const halls = anchored.filter((b) => /hall|hous|apartment/i.test(b));
	const teaching = anchored.filter((b) => !halls.includes(b));

	// A whole week, the way one actually falls out: a few courses on Monday,
	// Wednesday and Friday, a couple on Tuesday and Thursday. Generating a
	// single day left four of the five empty, and a preview you can page
	// through is the point of it.
	const patterns: number[][] = [
		[1, 3, 5],
		[1, 3, 5],
		[1, 3, 5],
		[2, 4],
		[2, 4]
	];

	// Distinct blocks within each pattern, so nobody is in two rooms at once.
	const mwf = some(BLOCKS, 3).sort((a, b) => BLOCKS.indexOf(a) - BLOCKS.indexOf(b));
	const tth = some(BLOCKS, 2).sort((a, b) => BLOCKS.indexOf(a) - BLOCKS.indexOf(b));
	const times = [...mwf, ...tth];

	const rooms = some(teaching, Math.min(teaching.length, patterns.length));

	const schedule: Course[] = patterns.slice(0, rooms.length).map((days, i) => {
		const dept = pick(DEPT);
		const code = `${dept}-${1000 + Math.floor(random() * 3000)}`;
		return {
			code,
			section: `${code}-0${1 + Math.floor(random() * 8)}`,
			title: pick(TITLE),
			meets: [
				{
					days,
					start: times[i][0],
					end: times[i][1],
					building: rooms[i],
					room: String(100 + Math.floor(random() * 250)),
					online: false,
					kind: 'Lecture'
				}
			]
		};
	});

	return {
		gmId: 'demo',
		name: NAME,
		avatar: null,
		photos: [],
		matched: true,
		id: String(2700000 + Math.floor(random() * 90000)),
		legalName: NAME,
		class: pick(['FR', 'SO', 'JR', 'SR']),
		// A dorm is where the first walk of the day starts from.
		dorm: halls.length ? pick(halls) : null,
		room: String(100 + Math.floor(random() * 300)),
		hometown: null,
		directoryPhoto: null,
		majors: [],
		schedule
	};
}
