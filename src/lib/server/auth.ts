// Sign in with Google, and nothing else.
//
// One provider, no passwords, no recovery flows: the entire thing is an
// authorization-code exchange and a random cookie, so it is written out rather
// than pulled in. Everything here is Web Crypto, which is what Workers gives us.
//
// The interesting part is not the OAuth. It is that a @cedarville.edu address
// is the directory's Username column with a domain stapled on, so the moment
// somebody signs in we already know which student they are. The claim form
// arrives pre-answered and approving it is a glance.

import { eq, lt } from 'drizzle-orm';
import type { DB } from './db';
import { schema } from './db';
import { seatFor } from './placeholder';

export const CAMPUS_DOMAIN = 'cedarville.edu';
export const SESSION_COOKIE = 'assassins_session';
const SESSION_DAYS = 30;
const AUTH = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN = 'https://oauth2.googleapis.com/token';

export type Env = {
	DB: D1Database;
	/**
	 * The origin the outside world reaches us on. Only needed when that is not
	 * what the socket saw — a tunnel back to localhost forwards the bytes but
	 * terminates TLS somewhere else, so the server believes it is plain http
	 * and builds a redirect_uri Google will not match. Unset in production,
	 * where Cloudflare gets this right on its own.
	 */
	ORIGIN?: string;
	GOOGLE_CLIENT_ID: string;
	GOOGLE_CLIENT_SECRET: string;
	POLAR_ACCESS_TOKEN?: string;
	POLAR_WEBHOOK_SECRET?: string;
	POLAR_SERVER?: string;
	POLAR_PRODUCT_ID?: string;
	ADMIN_USERNAMES?: string;
	/** Reading the kills topic. Without it that whole feature is absent. */
	GROUPME_TOKEN?: string;
	GROUPME_GROUP?: string;
	GROUPME_KILLS_TOPIC?: string;
	GROUPME_SNIPES_TOPIC?: string;
};

/** The origin to build public URLs from, which is not always the one we saw. */
export const originOf = (env: Env, url: URL) => (env.ORIGIN || url.origin).replace(/\/+$/, '');

/** The OAuth redirect, which has to be byte-identical in both legs of the flow. */
export const callbackUri = (env: Env, url: URL) => `${originOf(env, url)}/auth/callback`;

/** A Cedarville address is `username@cedarville.edu` and nothing else is. */
export const usernameOf = (email: string) => {
	const at = email.toLowerCase().trim();
	return at.endsWith('@' + CAMPUS_DOMAIN) ? at.slice(0, -(CAMPUS_DOMAIN.length + 1)) : null;
};

export const isAdminName = (env: Env, username: string | null) =>
	!!username &&
	(env.ADMIN_USERNAMES ?? '')
		.split(',')
		.map((s) => s.trim().toLowerCase())
		.filter(Boolean)
		.includes(username);

// ─── small crypto ───────────────────────────────────────────────────────────

const b64url = (bytes: ArrayBuffer | Uint8Array) =>
	btoa(String.fromCharCode(...new Uint8Array(bytes)))
		.replaceAll('+', '-')
		.replaceAll('/', '_')
		.replaceAll('=', '');

const random = (bytes = 32) => b64url(crypto.getRandomValues(new Uint8Array(bytes)));

const sha256 = async (s: string) =>
	b64url(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)));

// ─── the redirect out ───────────────────────────────────────────────────────

export type Pending = { state: string; verifier: string; url: string };

export async function beginSignIn(env: Env, redirectUri: string, next: string): Promise<Pending> {
	const state = random(16);
	const verifier = random(32);
	const challenge = await sha256(verifier);

	const url = new URL(AUTH);
	url.search = new URLSearchParams({
		client_id: env.GOOGLE_CLIENT_ID,
		redirect_uri: redirectUri,
		response_type: 'code',
		scope: 'openid email profile',
		// Ask Google to show only campus accounts. It is a hint, not a promise,
		// which is why the callback checks the domain again for real.
		hd: CAMPUS_DOMAIN,
		prompt: 'select_account',
		state: `${state}.${b64url(new TextEncoder().encode(next))}`,
		code_challenge: challenge,
		code_challenge_method: 'S256'
	}).toString();

	return { state, verifier, url: url.toString() };
}

/** Where the browser wanted to go before it was sent to Google. */
export function unpackState(raw: string) {
	const [state, next] = raw.split('.');
	let target = '/claim';
	try {
		const decoded = atob(next.replaceAll('-', '+').replaceAll('_', '/'));
		// Only ever our own paths, so a crafted link cannot bounce somebody out.
		if (decoded.startsWith('/') && !decoded.startsWith('//')) target = decoded;
	} catch {
		/* keep the default */
	}
	return { state, next: target };
}

// ─── the exchange ───────────────────────────────────────────────────────────

export type GoogleIdentity = {
	sub: string;
	email: string;
	name: string;
	picture: string | null;
};

export async function exchangeCode(
	env: Env,
	code: string,
	verifier: string,
	redirectUri: string
): Promise<GoogleIdentity> {
	const res = await fetch(TOKEN, {
		method: 'POST',
		headers: { 'content-type': 'application/x-www-form-urlencoded' },
		body: new URLSearchParams({
			code,
			client_id: env.GOOGLE_CLIENT_ID,
			client_secret: env.GOOGLE_CLIENT_SECRET,
			redirect_uri: redirectUri,
			grant_type: 'authorization_code',
			code_verifier: verifier
		})
	});
	if (!res.ok) throw new Error(`Google refused the code (${res.status}).`);

	const { id_token } = (await res.json()) as { id_token?: string };
	if (!id_token) throw new Error('Google sent no identity back.');

	// The token came straight from Google's token endpoint over TLS, which is
	// what makes reading it without re-verifying the signature legitimate here:
	// there is no untrusted party between us and the issuer.
	const claims = JSON.parse(
		new TextDecoder().decode(
			Uint8Array.from(
				atob(id_token.split('.')[1].replaceAll('-', '+').replaceAll('_', '/')),
				(c) => c.charCodeAt(0)
			)
		)
	) as {
		sub: string;
		email?: string;
		email_verified?: boolean;
		name?: string;
		picture?: string;
		aud?: string;
	};

	if (claims.aud !== env.GOOGLE_CLIENT_ID) throw new Error('That token was not for us.');
	if (!claims.email || claims.email_verified === false)
		throw new Error('Google has not verified that address.');

	return {
		sub: claims.sub,
		email: claims.email.toLowerCase(),
		name: claims.name ?? claims.email,
		picture: claims.picture ?? null
	};
}

// ─── users and sessions ─────────────────────────────────────────────────────

export async function upsertUser(db: DB, env: Env, who: GoogleIdentity) {
	const username = usernameOf(who.email);
	if (!username) throw new Error(`Assassins is for @${CAMPUS_DOMAIN} accounts.`);

	const now = new Date();
	const [existing] = await db
		.select()
		.from(schema.user)
		.where(eq(schema.user.googleSub, who.sub))
		.limit(1);

	// Somebody may have been impersonated before ever signing in, which leaves a
	// real account already approved as them. That is their seat: take it, rather
	// than opening a second one and leaving the claim stranded on the first.
	const held = existing ? null : await seatFor(db, username, who.email);
	if (held) {
		await db
			.update(schema.user)
			.set({
				googleSub: who.sub,
				name: who.name,
				email: who.email,
				image: who.picture,
				username,
				...(isAdminName(env, username) ? { role: 'admin' } : {}),
				updatedAt: now
			})
			.where(eq(schema.user.id, held.id));
		return held.id;
	}

	if (existing) {
		// A name or a photo can change between terms; the role should not be
		// quietly downgraded by a config typo, so it is only ever granted here.
		await db
			.update(schema.user)
			.set({
				name: who.name,
				email: who.email,
				image: who.picture,
				username,
				...(isAdminName(env, username) ? { role: 'admin' } : {}),
				updatedAt: now
			})
			.where(eq(schema.user.id, existing.id));
		return existing.id;
	}

	const id = crypto.randomUUID();
	await db.insert(schema.user).values({
		id,
		googleSub: who.sub,
		name: who.name,
		email: who.email,
		image: who.picture,
		username,
		role: isAdminName(env, username) ? 'admin' : 'player',
		plan: 'free',
		createdAt: now,
		updatedAt: now
	});
	return id;
}

export async function startSession(db: DB, userId: string) {
	const token = random(32);
	const expiresAt = new Date(Date.now() + SESSION_DAYS * 864e5);
	await db.insert(schema.session).values({
		id: await sha256(token),
		userId,
		expiresAt,
		createdAt: new Date()
	});
	// Expired rows are only ever in the way, and sign-in is the natural moment
	// to sweep them.
	await db.delete(schema.session).where(lt(schema.session.expiresAt, new Date()));
	return { token, expiresAt };
}

export async function readSession(db: DB, token: string | undefined) {
	if (!token) return null;
	const [row] = await db
		.select({ session: schema.session, user: schema.user })
		.from(schema.session)
		.innerJoin(schema.user, eq(schema.user.id, schema.session.userId))
		.where(eq(schema.session.id, await sha256(token)))
		.limit(1);

	if (!row) return null;
	if (row.session.expiresAt.getTime() < Date.now()) {
		await db.delete(schema.session).where(eq(schema.session.id, row.session.id));
		return null;
	}
	return row.user;
}

export const endSession = async (db: DB, token: string | undefined) => {
	if (token) await db.delete(schema.session).where(eq(schema.session.id, await sha256(token)));
};

export const cookieOptions = (secure: boolean) =>
	({
		path: '/',
		httpOnly: true,
		sameSite: 'lax' as const,
		secure,
		maxAge: SESSION_DAYS * 86400
	});
