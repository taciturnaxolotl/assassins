// A person who does not exist, walking a day that never happened.
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

const pick = <T>(xs: T[]) => xs[Math.floor(Math.random() * xs.length)];

function some<T>(xs: T[], n: number) {
	const pool = [...xs];
	const out: T[] = [];
	while (out.length < n && pool.length) out.push(...pool.splice(Math.floor(Math.random() * pool.length), 1));
	return out;
}

/** Invent a day plausible enough to draw. The person is openly nobody. */
export function inventPlayer(campus: Campus, day: number): Player {
	// Only buildings the map can actually anchor, or the route has nothing to
	// join up and the demo shows an empty campus.
	const anchored = Object.keys(campus.anchors);
	const halls = anchored.filter((b) => /hall|hous|apartment/i.test(b));
	const teaching = anchored.filter((b) => !halls.includes(b));

	// Two to four classes, in buildings the map can anchor, so every leg of the
	// walk has both ends on the map and actually draws.
	const howMany = Math.min(teaching.length, 2 + Math.floor(Math.random() * 3));
	const rooms = some(teaching, howMany);
	const slots = some(BLOCKS, rooms.length).sort(
		(a, b) => BLOCKS.indexOf(a) - BLOCKS.indexOf(b)
	);

	const schedule: Course[] = rooms.map((building, i) => {
		const dept = pick(DEPT);
		const code = `${dept}-${1000 + Math.floor(Math.random() * 3000)}`;
		return {
			code,
			section: `${code}-0${1 + Math.floor(Math.random() * 8)}`,
			title: pick(TITLE),
			meets: [
				{
					days: [day],
					start: slots[i][0],
					end: slots[i][1],
					building,
					room: String(100 + Math.floor(Math.random() * 250)),
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
		id: String(2700000 + Math.floor(Math.random() * 90000)),
		legalName: NAME,
		class: pick(['FR', 'SO', 'JR', 'SR']),
		// A dorm is where the first walk of the day starts from.
		dorm: halls.length ? pick(halls) : null,
		room: String(100 + Math.floor(Math.random() * 300)),
		hometown: null,
		directoryPhoto: null,
		majors: [],
		schedule
	};
}
