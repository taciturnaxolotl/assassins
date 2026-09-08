<script lang="ts">
	import { enhance } from '$app/forms';
	import PlayerCombobox from '$lib/components/PlayerCombobox.svelte';
	import { Button } from '$lib/components/ui/button';
	import { Badge } from '$lib/components/ui/badge';
	import { Input } from '$lib/components/ui/input';
	import * as Alert from '$lib/components/ui/alert';
	let { data, form } = $props();

	const groups = $derived({
		pending: data.rows.filter((r) => r.status === 'pending'),
		approved: data.rows.filter((r) => r.status === 'approved'),
		denied: data.rows.filter((r) => r.status === 'denied')
	});

	let open = $state<string | null>(null);
	let fixTo = $state<Record<string, string>>({});
</script>

<svelte:head><title>Queue · Assassins</title></svelte:head>

<header>
	<h1>Queue</h1>
	<nav>
		<a href="/target">Back to the game</a>
	</nav>
</header>

<main>
	{#if form?.message}
		<Alert.Root class="mb-4"><Alert.Description>{form.message}</Alert.Description></Alert.Root>
	{/if}

	<section class="block">
		<h2 class="rule">Reported kills — {data.kills.length}</h2>
		{#if !data.kills.length}
			<p class="empty">Nothing waiting.</p>
		{:else}
			<p class="legal">
				Until one of these is confirmed the victim is still hunting and the
				killer has inherited nothing.
			</p>
			<table class="sheet">
				<thead>
					<tr><th>Killer</th><th>Victim</th><th>Reported</th><th></th></tr>
				</thead>
				<tbody>
					{#each data.kills as k (k.victimGmId)}
						<tr>
							<td>{k.killer ?? 'unknown'}</td>
							<td>{k.victim}</td>
							<td>{new Date(k.at).toLocaleString()}</td>
							<td>
								<form method="POST" action="?/kill" use:enhance class="pair">
									<input type="hidden" name="victimGmId" value={k.victimGmId} />
									<Button size="sm" name="verdict" value="confirm" type="submit">Confirm</Button>
									<Button size="sm" variant="outline" name="verdict" value="reject" type="submit">
										Throw out
									</Button>
								</form>
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		{/if}
	</section>

	{#each [['pending', 'Waiting'], ['approved', 'In the game'], ['denied', 'Turned down']] as [key, title] (key)}
		{@const rows = groups[key as keyof typeof groups]}
		<section class="block">
			<h2 class="rule">{title} — {rows.length}</h2>
			{#if !rows.length}
				<p class="empty">Nobody.</p>
			{:else}
				<div class="rows">
					{#each rows as r (r.userId)}
						<article class="row" class:vouched={r.vouched}>
							<div class="top">
								<div>
									<div class="nm">{r.user.name}</div>
									<div class="legal">{r.user.email}</div>
								</div>
								<div class="arrow">plays as</div>
								<div>
									<div class="nm blood">{r.as}</div>
									{#if r.vouched}
										<div class="legal live">directory agrees</div>
									{:else}
										<div class="legal warn">no directory match — check this one</div>
									{/if}
								</div>
								<Badge variant={r.user.plan === 'pro' ? 'default' : 'outline'}>
									{r.user.plan}
								</Badge>
							</div>

							{#if r.pitch}<p class="pitch">“{r.pitch}”</p>{/if}
							{#if r.verdict}<p class="legal">verdict: {r.verdict}</p>{/if}

							<div class="acts">
								<form method="POST" action="?/decide" use:enhance>
									<input type="hidden" name="userId" value={r.userId} />
									<input type="hidden" name="gmId" value={r.gmId} />
									{#if r.status !== 'approved'}
										<Button size="sm" name="status" value="approved" type="submit">
											Approve
										</Button>
									{/if}
									{#if r.status !== 'denied'}
										<Button size="sm" variant="outline" name="status" value="denied" type="submit">
											Deny
										</Button>
									{/if}
									{#if r.status !== 'pending'}
										<Button size="sm" variant="ghost" name="status" value="pending" type="submit">
											Back to queue
										</Button>
									{/if}
								</form>

								<form method="POST" action="?/comp" use:enhance>
									<input type="hidden" name="userId" value={r.userId} />
									<Button
										size="sm"
										variant="outline"
										type="submit"
										name="plan"
										value={r.user.plan === 'pro' ? 'free' : 'pro'}
									>
										{r.user.plan === 'pro' ? 'Drop to free' : 'Unlock for free'}
									</Button>
								</form>

								<Button
									size="sm"
									variant="ghost"
									onclick={() => (open = open === r.userId ? null : r.userId)}
								>
									{open === r.userId ? 'Never mind' : 'Wrong player?'}
								</Button>
							</div>

							{#if open === r.userId}
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
			{/if}
		</section>
	{/each}
</main>

<style>
	header {
		display: flex;
		align-items: baseline;
		gap: 20px;
		padding: 14px 22px;
		border-bottom: 1px solid var(--color-line);
	}
	h1 {
		font: 400 28px/1 var(--font-serif);
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
		max-width: 900px;
		margin: 0 auto;
		padding: 22px;
	}
	h2.rule {
		font-family: var(--font-mono);
	}

	.rows {
		display: grid;
		gap: 8px;
	}
	.row {
		background: var(--color-panel);
		border: 1px solid var(--color-line);
		border-left: 2px solid var(--color-warn);
		border-radius: 3px;
		padding: 13px 15px;
	}
	.row.vouched {
		border-left-color: var(--color-live);
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
	.nm.blood {
		color: var(--color-blood);
	}
	.arrow {
		font-size: 10px;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		color: var(--color-faint);
	}
	.legal.live {
		color: var(--color-live);
	}
	.legal.warn {
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
	.acts form,
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

	@media (max-width: 620px) {
		.top {
			grid-template-columns: 1fr;
			gap: 4px;
		}
	}
</style>
