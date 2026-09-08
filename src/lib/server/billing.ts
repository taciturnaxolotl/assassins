// Polar, used directly.
//
// Polar knows our users by their own id (`externalCustomerId`), so we never
// store a customer id of theirs, and the webhook writes the plan onto the user
// row. Every request after that decides access from a column read rather than a
// call out to a billing API.

import { Polar } from '@polar-sh/sdk';
import { validateEvent, WebhookVerificationError } from '@polar-sh/sdk/webhooks';
import { eq } from 'drizzle-orm';
import type { DB } from './db';
import { schema } from './db';
import type { Env } from './auth';

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

export async function portalUrl(env: Env, userId: string, origin: string) {
	const session = await client(env).customerSessions.create({
		externalCustomerId: userId
	});
	return session.customerPortalUrl ?? `${origin}/upgrade`;
}

// ─── the webhook ────────────────────────────────────────────────────────────

const setPlan = (db: DB, userId: string, plan: string, until: Date | null) =>
	db
		.update(schema.user)
		.set({ plan, planUntil: until, updatedAt: new Date() })
		.where(eq(schema.user.id, userId));

/**
 * Every event Polar sends about a subscription answers the same question — is
 * this person paid up right now — so they all funnel to one write.
 */
export async function handleWebhook(env: Env, db: DB, body: string, headers: Headers) {
	let event;
	try {
		event = validateEvent(
			body,
			Object.fromEntries(headers.entries()),
			env.POLAR_WEBHOOK_SECRET ?? ''
		);
	} catch (e) {
		if (e instanceof WebhookVerificationError) return { ok: false, status: 403 };
		throw e;
	}

	const data = event.data as {
		externalId?: string | null;
		customer?: { externalId?: string | null } | null;
		status?: string;
		currentPeriodEnd?: string | Date | null;
		activeSubscriptions?: { status: string; currentPeriodEnd?: string | Date | null }[];
	};

	const userId = data.customer?.externalId ?? data.externalId ?? null;
	if (!userId) return { ok: true, status: 200 };

	switch (event.type) {
		case 'customer.state_changed': {
			const live = (data.activeSubscriptions ?? []).find((s) => s.status === 'active');
			await setPlan(db, userId, live ? 'pro' : 'free', when(live?.currentPeriodEnd));
			break;
		}
		case 'subscription.active':
		case 'subscription.updated':
		case 'subscription.created':
			await setPlan(
				db,
				userId,
				data.status === 'active' ? 'pro' : 'free',
				when(data.currentPeriodEnd)
			);
			break;
		case 'subscription.canceled':
		case 'subscription.revoked':
			// A cancellation still runs to the end of the period Polar reports.
			await setPlan(db, userId, 'free', when(data.currentPeriodEnd));
			break;
	}

	return { ok: true, status: 200 };
}

const when = (v: string | Date | null | undefined) => (v ? new Date(v) : null);
