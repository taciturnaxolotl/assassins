export type Shot = { url: string; rotate: number };

export type Meeting = {
	days: number[];
	start: string | null;
	end: string | null;
	building: string | null;
	room: string | null;
	online: boolean;
	kind: string | null;
};

export type Course = {
	code: string;
	section: string;
	title: string | null;
	credits?: number;
	instructor?: string | null;
	enrolled?: number;
	capacity?: number;
	meets: Meeting[];
};

export type Candidate = { id: string; name: string; class: string; dorm: string };

export type Player = {
	gmId: string;
	name: string;
	avatar: Shot | null;
	photos: Shot[];
	matched: boolean;
	candidates?: Candidate[];
	id?: string;
	username?: string | null;
	legalName?: string;
	class?: string;
	dorm?: string | null;
	room?: string | null;
	gender?: string | null;
	hometown?: string | null;
	directoryPhoto?: Shot | null;
	majors?: { major: string; score: number }[];
	schedule?: Course[];
};

export type Campus = {
	origin: [number, number];
	box: [number, number, number, number];
	buildings: { name: string; ring: [number, number][]; focus: boolean }[];
	nodes: [number, number][];
	edges: [number, number, number][];
	anchors: Record<string, { node: number; metres: number }>;
	missing: string[];
};

export type Dossier = {
	term: string;
	campus: Campus | null;
	players: Player[];
	group: { id: string; name: string };
};

// What the server is willing to tell you, given who you are and what you pay.
export type Tier = 'anon' | 'unclaimed' | 'pending' | 'denied' | 'free' | 'pro';

export type Chain = {
	assigned: Record<string, string>;
	kills: Record<string, string>;
};

/**
 * The ring as one account is allowed to know it.
 *
 * Who hunts whom is the only real secret in this game, and the app collects it
 * from ninety-nine people. Handing it back to them would end the game, so the
 * inheritance walk happens on the server and the browser is told one answer:
 * its own current target. `assigned` holds only the reader's own reported edge
 * unless they run the game.
 */
export type ChainView = Chain & {
	/** Resolved through however many corpses are in the way. */
	myTarget: string | null;
	/** A kill you have reported that is still waiting to be confirmed. */
	claimedKill: string | null;
	/** True only for whoever runs the game, where `assigned` really is everyone. */
	full: boolean;
};
