<script lang="ts">
	import { enhance } from '$app/forms';
	import { Button } from '$lib/components/ui/button';
	import { Badge } from '$lib/components/ui/badge';
	import { Input } from '$lib/components/ui/input';
	import * as Alert from '$lib/components/ui/alert';
	import PlayerCombobox from '$lib/components/PlayerCombobox.svelte';

	let { data, form } = $props();

	let fixing = $state<string | null>(null);
	let fixTo = $state<Record<string, string>>({});
	let q = $state('');

	const waiting = $derived(data.needs.claims.length + data.needs.kills.length);

	const settled = $derived(
		data.settled.filter(
			(r) =>
				!q ||
				`${r.user.name} ${r.user.email} ${r.as}`.toLowerCase().includes(q.toLowerCase())
		)
	);

	const when = (d: string | Date) =>
		new Date(d).toLocaleString(undefined, {
			month: 'short',
			day: 'numeric',
			hour: 'numeric',
			minute: '2-digit'
		});
</script>

<svelte:head><title>Queue · Assassins</title></svelte:head>

<header>
	<h1>Queue</h1>
	{#if waiting}
		<Badge variant="destructive">{waiting} waiting</Badge>
	{:else}
		<span class="clear">nothing waiting</span>
	{/if}
	<nav><a href="/target">Back to the game</a></nav>
</header>

<main>
	{#if form?.message}
		<Alert.Root class="mb-5"><Alert.Description>{form.message}</Alert.Description></Alert.Root>
	{/if}

	<!-- ── what needs a person ──────────────────────────────────────────── -->

	{#if data.needs.kills.length}
		<section>
			<h2 class="rule">Reported kills — {data.needs.kills.length}</h2>
			<p class="legal">
				Until you confirm one, the victim is still hunting and the killer has
				inherited nothing.
			</p>
			<div class="rows">
				{#each data.needs.kills as k (k.victimGmId)}
					<article class="row act">
						<div class="story">
							<strong>{k.killer ?? 'Somebody'}</strong> took out
							<strong class="blood">{k.victim}</strong>
							{#if k.wins}
								<span class="live">— confirming this ends the game</span>
							{:else if k.inherits}
								<span class="faint">and would inherit {k.inherits}</span>
							{:else}
								<span class="faint">and inherits nothing — {k.victim} never reported a draw</span>
							{/if}
							<div class="legal">{when(k.at)}</div>
						</div>
						<form method="POST" action="?/kill" use:enhance class="pair">
							<input type="hidden" name="victimGmId" value={k.victimGmId} />
							<Button size="sm" name="verdict" value="confirm" type="submit">Confirm</Button>
							<Button size="sm" variant="outline" name="verdict" value="reject" type="submit">
								Throw out
							</Button>
						</form>
					</article>
				{/each}
			</div>
		</section>
	{/if}

	{#if data.needs.claims.length}
		<section>
			<h2 class="rule">Claims — {data.needs.claims.length}</h2>
			<div class="rows">
				{#each data.needs.claims as r (r.userId)}
					<article class="row" class:vouched={r.vouched} class:agent={r.freeAgent}>
						<div class="top">
							<div>
								<div class="nm">{r.user.name}</div>
								<div class="legal">{r.user.email}</div>
							</div>
							<div class="arrow">plays as</div>
							<div>
								<div class="nm blood">{r.as}</div>
								{#if r.freeAgent}
									<div class="legal">outside the ring — nothing to verify</div>
								{:else if r.vouched}
									<div class="legal live">the directory agrees</div>
								{:else}
									<div class="legal warn">no directory match — check this one</div>
								{/if}
							</div>
							<div class="legal">{when(r.createdAt)}</div>
						</div>

						{#if r.pitch}<p class="pitch">“{r.pitch}”</p>{/if}

						<div class="acts">
							<form method="POST" action="?/decide" use:enhance class="pair">
								<input type="hidden" name="userId" value={r.userId} />
								<input type="hidden" name="gmId" value={r.gmId ?? ''} />
								<Button size="sm" name="status" value="approved" type="submit">Approve</Button>
								<Button size="sm" variant="outline" name="status" value="denied" type="submit">
									Deny
								</Button>
							</form>
							{#if !r.freeAgent}
								<Button
									size="sm"
									variant="ghost"
									onclick={() => (fixing = fixing === r.userId ? null : r.userId)}
								>
									{fixing === r.userId ? 'Never mind' : 'Wrong player?'}
								</Button>
							{/if}
							<form method="POST" action="/admin/spoof">
								<input type="hidden" name="userId" value={r.userId} />
								<Button size="sm" variant="ghost" type="submit">View as them</Button>
							</form>
						</div>

						{#if fixing === r.userId}
							<form method="POST" action="?/decide" class="fix" use:enhance>
								<input type="hidden" name="userId" value={r.userId} />
								<input type="hidden" name="gmId" value={fixTo[r.userId] ?? r.gmId} />
								<PlayerCombobox
									options={data.roster}
									value={fixTo[r.userId] ?? r.gmId ?? ''}
									placeholder="Pick the right player"
									onpick={(v) => (fixTo = { ...fixTo, [r.userId]: v })}
								/>
								<Input name="verdict" autocomplete="off" placeholder="why, for the record" />
								<Button size="sm" name="status" value="approved" type="submit">
									Approve as this player instead
								</Button>
							</form>
						{/if}
					</article>
				{/each}
			</div>
		</section>
	{/if}

	{#if !waiting}
		<p class="empty">Nothing needs you.</p>
	{/if}

	<!-- ── where the game stands ────────────────────────────────────────── -->

	<section>
		<h2 class="rule">The game</h2>
		<dl class="stats">
			<div><dt>Playing</dt><dd>{data.state.players}</dd></div>
			<div><dt>Signed in</dt><dd>{data.state.claimed}</dd></div>
			<div><dt>Draws reported</dt><dd>{data.state.reported}</dd></div>
			<div><dt>Down</dt><dd>{data.state.down}</dd></div>
			<div><dt>Paid</dt><dd>{data.state.pro}</dd></div>
			<div><dt>Free agents</dt><dd>{data.state.agents}</dd></div>
		</dl>

		{#if data.state.quiet}
			<p class="legal">
				<strong class="warn">{data.state.quiet}</strong> signed in and alive but have
				not said who they drew. Every one is a gap in the ring.
			</p>
		{/if}
		{#if data.state.unidentified}
			<p class="legal">
				<strong class="warn">{data.state.unidentified}</strong> players the build
				could not resolve to a student. They settle in
				<code>data/overrides.tsv</code>, or when they sign in and the directory
				answers for them.
			</p>
		{/if}
	</section>

	{#if data.unclaimed.length}
		<section>
			<details class="fold">
				<summary>
					Not signed in — {data.unclaimed.length} of {data.state.players}
				</summary>
				<p class="legal">
					On the roster, nobody has claimed them. These are who to chase — or
					step into, which makes the account they would have had. They keep it
					when they sign in.
				</p>
				<table class="sheet">
					<tbody>
						{#each data.unclaimed as p (p.gmId)}
							<tr>
								<td><a href="/player/{p.gmId}" class:unknown={!p.matched}>{p.name}</a></td>
								<td class="legal">{p.matched ? '' : 'unidentified'}</td>
								<td class="right">
									<form method="POST" action="/admin/spoof">
										<input type="hidden" name="gmId" value={p.gmId} />
										<Button size="sm" variant="ghost" type="submit">View as</Button>
									</form>
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</details>
		</section>
	{/if}

	<!-- ── history ──────────────────────────────────────────────────────── -->

	<section>
		<h2 class="rule">Decided — {data.settled.length}</h2>
		{#if data.settled.length > 8}
			<Input
				class="mb-3"
				type="search"
				placeholder="name or email…"
				oninput={(e) => (q = e.currentTarget.value)}
			/>
		{/if}
		{#if !settled.length}
			<p class="empty">Nothing yet.</p>
		{:else}
			<table class="sheet">
				<thead>
					<tr><th>Account</th><th>Plays as</th><th>Plan</th><th>Decided</th><th></th></tr>
				</thead>
				<tbody>
					{#each settled as r (r.userId)}
						<tr class:gone={r.status === 'denied'}>
							<td>
								{r.user.name}
								<div class="legal">{r.user.email}</div>
							</td>
							<td>
								{r.as}
								{#if r.status === 'denied'}<span class="faint"> — denied</span>{/if}
								{#if r.verdict}<div class="legal">{r.verdict}</div>{/if}
							</td>
							<td>
								<form method="POST" action="?/comp" use:enhance>
									<Button
										size="sm"
										variant={r.user.plan === 'pro' ? 'default' : 'outline'}
										type="submit"
										name="plan"
										value={r.user.plan === 'pro' ? 'free' : 'pro'}
										title={r.user.plan === 'pro' ? 'Drop to free' : 'Unlock for free'}
									>
										{r.user.plan}
									</Button>
									<input type="hidden" name="userId" value={r.userId} />
								</form>
							</td>
							<td class="legal">{r.decidedAt ? when(r.decidedAt) : ''}</td>
							<td class="tools">
								<form method="POST" action="/admin/spoof">
									<input type="hidden" name="userId" value={r.userId} />
									<Button size="sm" variant="outline" type="submit" title="See exactly what they see">
										View as
									</Button>
								</form>
								<form method="POST" action="?/decide" use:enhance>
									<input type="hidden" name="userId" value={r.userId} />
									<input type="hidden" name="gmId" value={r.gmId ?? ''} />
									<Button
										size="sm"
										variant="ghost"
										name="status"
										value="pending"
										type="submit"
										title="Undo this decision and put the claim back in the queue"
									>
										Back to queue
									</Button>
								</form>
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		{/if}
	</section>
</main>

<style>
	header {
		display: flex;
		align-items: baseline;
		gap: 14px;
		padding: 14px 22px;
		border-bottom: 1px solid var(--color-line);
	}
	h1 {
		font: 400 28px/1 var(--font-serif);
	}
	.clear {
		font-size: 11px;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--color-live);
	}
	nav {
		margin-left: auto;
	}
	nav a {
		color: var(--color-faint);
		font-size: 11px;
		letter-spacing: 0.1em;
		text-transform: uppercase;
	}
	nav a:hover {
		color: var(--color-blood);
	}

	main {
		max-width: 940px;
		margin: 0 auto;
		padding: 22px;
	}
	section {
		margin-bottom: 34px;
	}
	h2.rule {
		font-family: var(--font-mono);
		margin-top: 0;
	}

	.rows {
		display: grid;
		gap: 8px;
	}
	.row {
		background: var(--color-panel);
		border: 1px solid var(--color-line);
		/* The left edge carries the verdict you can make at a glance. */
		border-left: 2px solid var(--color-warn);
		border-radius: 3px;
		padding: 13px 15px;
	}
	.row.vouched {
		border-left-color: var(--color-live);
	}
	.row.agent {
		border-left-color: var(--color-dim);
	}
	.row.act {
		border-left-color: var(--color-blood);
		display: flex;
		align-items: center;
		gap: 16px;
		flex-wrap: wrap;
	}
	.row.act .story {
		flex: 1 1 320px;
		line-height: 1.6;
	}

	.top {
		display: grid;
		grid-template-columns: 1fr auto 1fr auto;
		gap: 14px;
		align-items: center;
	}
	.nm {
		font: 400 17px/1.2 var(--font-serif);
	}
	.nm.blood,
	strong.blood {
		color: var(--color-blood);
	}
	strong {
		font-weight: 400;
		color: var(--color-ink);
	}
	.arrow {
		font-size: 10px;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		color: var(--color-faint);
	}
	.legal.live,
	.live {
		color: var(--color-live);
	}
	.legal.warn,
	.warn {
		color: var(--color-warn);
	}

	.pitch {
		margin-top: 10px;
		font-family: var(--font-serif);
		font-size: 15px;
		color: var(--color-dim);
	}

	.acts {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
		margin-top: 12px;
	}
	.pair {
		display: flex;
		gap: 6px;
	}
	.fix {
		display: grid;
		gap: 6px;
		margin-top: 10px;
		padding-top: 10px;
		border-top: 1px solid var(--color-line);
	}

	.stats {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(110px, 1fr));
		gap: 1px;
		background: var(--color-line);
		border: 1px solid var(--color-line);
		border-radius: 3px;
		overflow: hidden;
		margin-bottom: 12px;
	}
	.stats div {
		background: var(--color-panel);
		padding: 11px 13px;
	}
	.stats dt {
		font-size: 10px;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--color-faint);
	}
	.stats dd {
		font: 400 24px/1.1 var(--font-serif);
		margin-top: 3px;
	}

	.fold > summary {
		font: 500 11px/1 var(--font-mono);
		letter-spacing: 0.14em;
		text-transform: uppercase;
		color: var(--color-faint);
		padding-bottom: 8px;
	}
	.sheet a {
		color: var(--color-dim);
	}
	.sheet a:hover {
		color: var(--color-blood);
	}
	.sheet a.unknown {
		color: var(--color-warn);
	}
	td.right {
		text-align: right;
	}

	.sheet td form {
		display: inline;
	}
	td.tools {
		display: flex;
		gap: 6px;
		align-items: center;
	}
	code {
		color: var(--color-dim);
	}

	@media (max-width: 620px) {
		.top {
			grid-template-columns: 1fr;
			gap: 4px;
		}
	}
</style>
