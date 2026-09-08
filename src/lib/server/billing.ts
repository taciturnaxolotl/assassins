// Polar, used directly.
//
// Polar knows our users by our own id (`externalCustomerId`), so we never store
// a customer id of theirs, and access is written onto the user row. Every
// request after that decides from a column read rather than a call out to a
// billing API.
//
// The product is a one-off, which is right for a game that lasts a few weeks:
// you buy the file once and it stays open. That shapes everything here, because
// almost all of Polar's vocabulary is about subscriptions. A one-time purchase
// fires `order.paid` and nothing else — no subscription events ever, and an
// empty `activeSubscriptions` forever after. Anything that reads "no active
// subscription" as "not paid" would throw out every customer we have.
//
// So access is granted by either signal, and `customer.state_changed` is only
// ever allowed to upgrade.

import { Polar } from '@polar-sh/sdk';
import { Webhook } from 'standardwebhooks';
import { eq } from 'drizzle-orm';
import type { DB } from './db';
import { schema } from './db';
import type { Env } from './auth';

/** The two subscription states that mean access, if it ever becomes one. */
const PAID = new Set(['active', 'trialing']);

/** Orders that count. A refunded one does not. */
const SETTLED = new Set(['paid']);


const setPlan = (db: DB, userId: string, plan: string, until: Date | null) =>
	db
		.update(schema.user)
		.set({ plan, planUntil: until, updatedAt: new Date() })
		.where(eq(schema.user.id, userId));

/** Billing is optional: without a token everybody simply stays on the free tier. */
export const enabled = (env: Env) => !!(env.POLAR_ACCESS_TOKEN && env.POLAR_PRODUCT_ID);

const client = (env: Env) =>
	new Polar({
		accessToken: env.POLAR_ACCESS_TOKEN!,
		server: env.POLAR_SERVER === 'production' ? 'production' : 'sandbox'
	});

export async function checkoutUrl(
	env: Env,
	user: { id: string; email: string; name: string },
	origin: string
) {
	const checkout = await client(env).checkouts.create({
		products: [env.POLAR_PRODUCT_ID!],
		externalCustomerId: user.id,
		customerEmail: user.email,
		customerName: user.name,
		successUrl: `${origin}/target?welcome=1`
	});
	return checkout.url;
}

/**
 * The customer portal, if there is a customer to show one for.
 *
 * Polar only knows about somebody once they have been through checkout, so an
 * account that was let in another way — comped by an admin, or an admin
 * themselves — has nothing on Polar's side and asking throws. Null means there
 * is nothing to manage, which the caller can say plainly rather than crashing.
 */
export async function portalUrl(env: Env, userId: string) {
	try {
		const session = await client(env).customerSessions.create({ externalCustomerId: userId });
		return session.customerPortalUrl ?? null;
	} catch {
		return null;
	}
}

/**
 * Ask Polar outright whether this account has paid, and write it down.
 *
 * The webhook is the normal path, but checkout redirects the browser back
 * before Polar has finished telling us anything — so the one moment somebody is
 * staring at the screen waiting to be let in is exactly the moment the webhook
 * has not arrived. This closes that race, and doubles as the repair for any
 * webhook that went missing.
 */
export async function syncPlan(env: Env, db: DB, userId: string) {
	if (!enabled(env)) return null;
	const polar = client(env);

	try {
		// A settled order is the whole story for a one-off product.
		const orders = await polar.orders.list({
			externalCustomerId: userId,
			productId: env.POLAR_PRODUCT_ID!,
			limit: 5
		});
		for await (const page of orders)
			for (const order of page.result?.items ?? [])
				if (SETTLED.has(order.status)) {
					// A one-off has no end. Nobody knows when the game finishes, so
					// nothing here pretends to.
					await setPlan(db, userId, 'pro', null);
					return 'pro';
				}
	} catch {
		/* fall through to subscriptions */
	}

	try {
		const state = await polar.customers.getStateExternal({ externalId: userId });
		const live = (state.activeSubscriptions ?? []).find((s) => PAID.has(s.status));
		if (live) {
			await setPlan(db, userId, 'pro', live.currentPeriodEnd ?? null);
			return 'pro';
		}
	} catch {
		// No customer on Polar's side yet, which simply means they never paid.
		return null;
	}

	return 'free';
}

// ─── the webhook ────────────────────────────────────────────────────────────

export async function handleWebhook(env: Env, db: DB, body: string, headers: Headers) {
	// Verified against the Standard Webhooks spec directly rather than through
	// `@polar-sh/sdk/webhooks`.
	//
	// Their `validateEvent` cannot check a real Polar signature. It does
	// `Buffer.from(secret,'utf8').toString('base64')` and hands that to the same
	// library, which base64-decodes it straight back — so the key ends up being
	// the literal bytes of `whsec_…`, fifty of them, where the spec uses the
	// thirty-two you get by base64-decoding the part after the prefix. Polar's
	// servers sign to the spec. Measured: a spec-signed body fails
	// `validateEvent` and passes `new Webhook(secret).verify`, and an
	// SDK-signed one does the reverse.
	//
	// The signature is the security boundary and it is checked properly here.
	// The body is then read for the handful of fields this needs.
	let event: { type?: string; data?: Record<string, unknown> };
	try {
		new Webhook(env.POLAR_WEBHOOK_SECRET ?? '').verify(
			body,
			Object.fromEntries(headers.entries())
		);
		event = JSON.parse(body);
	} catch (e) {
		return { ok: false, status: 403, note: `rejected: ${(e as Error).message.slice(0, 120)}` };
	}
	if (!event?.type) return { ok: true, status: 202, note: 'no event type' };

	// Polar sends snake_case on the wire; the SDK was what camel-cased it.
	const data = (event.data ?? {}) as {
		// `customer.state_changed` carries the customer itself; everything else
		// nests it.
		// `customer.state_changed` carries the customer itself; everything else
		// nests it.
		external_id?: string | null;
		customer?: { external_id?: string | null } | null;
		status?: string;
		current_period_end?: string | null;
		active_subscriptions?: { status: string; current_period_end?: string | null }[];
	};

	const userId = data.customer?.external_id ?? data.external_id ?? null;
	if (!userId) return { ok: true, status: 200, note: `${event.type}: no external id` };

	const say = (note: string) => ({ ok: true as const, status: 200, note: `${event.type} ${note}` });

	switch (event.type) {
		// The only event a one-off product produces, and the one that matters.
		case 'order.paid':
			await setPlan(db, userId, 'pro', null);
			return say('-> pro');

		case 'order.refunded':
			await setPlan(db, userId, 'free', null);
			return say('-> free');

		// Only ever upgrades. A one-time buyer has no active subscription, and
		// reading that as "not paid" would revoke everybody.
		case 'customer.state_changed': {
			const live = (data.active_subscriptions ?? []).find((s) => PAID.has(s.status));
			if (!live) return say('no live subscription, left alone');
			await setPlan(db, userId, 'pro', when(live.current_period_end));
			return say('-> pro');
		}
	}

	// If the product ever becomes a subscription, the status is the answer —
	// not the event name. Polar fires `subscription.canceled` the moment
	// somebody asks to stop, while the status stays `active` until the period
	// they already paid for runs out.
	if (event.type.startsWith('subscription.')) {
		const paid = PAID.has(data.status ?? '');
		await setPlan(db, userId, paid ? 'pro' : 'free', when(data.current_period_end));
		return say(`(${data.status}) -> ${paid ? 'pro' : 'free'}`);
	}

	return say('ignored');
}

const when = (v: string | null | undefined) => (v ? new Date(v) : null);
