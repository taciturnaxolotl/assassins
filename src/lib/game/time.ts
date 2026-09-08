import type { Course, Meeting, NextClass, Player } from './types';

export const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const WEEK = [1, 2, 3, 4, 5];
export const CLASS: Record<string, string> = {
	FR: 'Freshman',
	SO: 'Sophomore',
	JR: 'Junior',
	SR: 'Senior',
	GR: 'Grad'
};

export const minutes = (t: string | null | undefined) => {
	const m = /^(\d+):(\d+)\s*(AM|PM)$/i.exec(t ?? '');
	if (!m) return null;
	return ((+m[1] % 12) + (m[3].toUpperCase() === 'PM' ? 12 : 0)) * 60 + +m[2];
};

export const hhmm = (mins: number) =>
	`${((mins / 60) | 0) % 12 || 12}:${String(mins % 60).padStart(2, '0')} ${mins % 1440 < 720 ? 'AM' : 'PM'}`;

// Where a meeting happens. Nursing clinicals and labs carry no room at all, so
// fall back to what kind of thing it is rather than an unhelpful "TBD".
export const place = (m: Meeting) =>
	m.online ? 'online' : [m.building, m.room].filter(Boolean).join(' ') || m.kind || 'TBD';

export type Slot = { p: Player; c: Course; m: Meeting; day: number; from: number; to: number };

// Every meeting, flattened, so "who is where at 2pm on a Wednesday" is one filter.
export function flatten(players: Player[]): Slot[] {
	const out: Slot[] = [];
	for (const p of players)
		for (const c of p.schedule ?? [])
			for (const m of c.meets ?? []) {
				const from = minutes(m.start);
				if (from == null) continue;
				const to = minutes(m.end) ?? from + 50;
				for (const d of m.days) out.push({ p, c, m, day: d, from, to });
			}
	return out.sort((a, b) => a.from - b.from);
}

// Matched by id, not by reference. `$state` deep-proxies the player list, so a
// player reached through the store is a Proxy while the same player handed in
// as a prop may be the raw object — reference equality then fails on the client
// and holds on the server, which renders a route that vanishes on hydration
// with no error to show for it. Ask for the id and the question goes away.
export const dayOf = (slots: Slot[], p: Player, day: number) =>
	slots.filter((s) => s.p.gmId === p.gmId && s.day === day).sort((a, b) => a.from - b.from);

// The soonest meeting from `now`, as its parts rather than a sentence, so the
// server can hand it to a page that will draw its own countdown. Shares the
// week-ahead search with nextClass below.
// A next-class time said the way a person would: a countdown when it is close,
// a day and a time when it is not.
export function until(day: number, from: number, now: Date): string {
	const nowMin = now.getHours() * 60 + now.getMinutes();
	const today = now.getDay();
	if (day === today) {
		const d = from - nowMin;
		if (d <= 0) return 'now';
		if (d < 60) return `in ${d} min`;
		if (d < 240) return `in ${Math.floor(d / 60)}h ${d % 60}m`;
		return hhmm(from);
	}
	if (day === (today + 1) % 7) return `tomorrow ${hhmm(from)}`;
	return `${DAYS[day]} ${hhmm(from)}`;
}

export function nextClassFrom(schedule: Course[], now: Date): NextClass | null {
	const slots: { c: Course; m: Meeting; day: number; from: number }[] = [];
	for (const c of schedule)
		for (const m of c.meets ?? []) {
			const from = minutes(m.start);
			if (from == null) continue;
			for (const d of m.days) slots.push({ c, m, day: d, from });
		}
	const mins = now.getHours() * 60 + now.getMinutes();
	for (let ahead = 0; ahead < 7; ahead++) {
		const day = (now.getDay() + ahead) % 7;
		const found = slots
			.filter((s) => s.day === day && (ahead > 0 || s.from > mins))
			.sort((a, b) => a.from - b.from)[0];
		if (found)
			return {
				label: found.c.code || found.c.section,
				place: place(found.m),
				day,
				from: found.from
			};
	}
	return null;
}

export function nextClass(slots: Slot[], p: Player, now = new Date()) {
	const mins = now.getHours() * 60 + now.getMinutes();
	for (let ahead = 0; ahead < 7; ahead++) {
		const day = (now.getDay() + ahead) % 7;
		const found = dayOf(slots, p, day).find((s) => ahead > 0 || s.to > mins);
		if (found) return `${ahead ? DAYS[day] + ' ' : ''}${hhmm(found.from)} ${place(found.m)}`;
	}
	return null;
}
