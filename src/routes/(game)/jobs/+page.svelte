<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Textarea } from '$lib/components/ui/textarea';
	import { Label } from '$lib/components/ui/label';
	import { Badge } from '$lib/components/ui/badge';
	import * as Card from '$lib/components/ui/card';
	import * as Alert from '$lib/components/ui/alert';
	import Who from '$lib/components/Who.svelte';
	import { game } from '$lib/game/store.svelte';
	import type { BoardEntry } from '$lib/server/market';

	let { data } = $props();
	const g = game();

	// The server is the source of truth; a move replaces the board wholesale
	// rather than patching two copies and hoping they agree.
	let fresh = $state<BoardEntry[] | null>(null);
	const contracts = $derived(fresh ?? data.contracts);

	let err = $state('');
	let busy = $state(false);

	let posting = $state(false);
	let offer = $state('');
	let heldBy = $state('');
	let terms = $state('');

	let bidding = $state<string | null>(null);
	let ask = $state('');
	let pitch = $state('');

	const mine = $derived(contracts.filter((c) => c.mine));
	const taken = $derived(contracts.filter((c) => c.taken));
	const open = $derived(contracts.filter((c) => !c.mine && c.status === 'open'));

	async function act(body: Record<string, unknown>) {
		busy = true;
		err = '';
		try {
			const res = await fetch('/api/market', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify(body)
			});
			if (!res.ok) {
				const said = (await res.json().catch(() => null)) as { message?: string } | null;
				throw new Error(said?.message ?? 'Refused.');
			}
			fresh = await res.json();
			await invalidateAll();
		} catch (e) {
			err = (e as Error).message;
		} finally {
			busy = false;
		}
	}

	const held = (who: string | null) =>
		who ? `${who} is holding it` : 'handed over when it is done';
</script>

<svelte:head><title>Jobs · Assassins</title></svelte:head>

{#if err}
	<Alert.Root variant="destructive" class="mb-4">
		<Alert.Description>{err}</Alert.Description>
	</Alert.Root>
{/if}

<div class="block">
	<h3 class="rule">Your contract</h3>

	{#if mine.length}
		{#each mine as c (c.id)}
			<Card.Root class="mb-2">
				<Card.Header>
					<Card.Title class="font-serif text-xl font-normal">
						<Who id={c.markGmId} />
					</Card.Title>
					<Card.Description>
						You put up <strong>{c.agreed ?? c.offer}</strong> · {held(c.heldBy)}
						{#if c.terms}<br />“{c.terms}”{/if}
					</Card.Description>
				</Card.Header>
				<Card.Content>
					{#if c.status === 'open'}
						{#if c.bids.length}
							<table class="sheet">
								<thead>
									<tr><th>Who</th><th>Wants</th><th>Says</th><th></th></tr>
								</thead>
								<tbody>
									{#each c.bids as b (b.hitmanUserId)}
										<tr>
											<td>
												{#if b.hitmanGmId}<Who id={b.hitmanGmId} />{:else}{b.hitmanName}{/if}
											</td>
											<td>{b.ask}</td>
											<td class="place">{b.pitch ?? ''}</td>
											<td>
												<Button
													size="sm"
													disabled={busy}
													onclick={() =>
														act({ action: 'accept', contractId: c.id, hitmanUserId: b.hitmanUserId })}
												>
													Shake on it
												</Button>
											</td>
										</tr>
									{/each}
								</tbody>
							</table>
						{:else}
							<p class="empty">Nobody has offered yet.</p>
						{/if}
						<Button
							variant="ghost"
							size="sm"
							disabled={busy}
							onclick={() => act({ action: 'cancel', contractId: c.id })}
						>
							Take it down
						</Button>
					{:else}
						<p>
							{#if c.takenByGmId}<Who id={c.takenByGmId} />{:else}{c.takenByName}{/if} took it
							for <strong>{c.agreed}</strong>.
							{#if c.settledByThem}They say it is settled.{/if}
						</p>
						{#if !c.settledByMe}
							<Button
								size="sm"
								disabled={busy}
								onclick={() => act({ action: 'settle', contractId: c.id })}
							>
								I handed it over
							</Button>
						{:else}
							<p class="legal">Waiting on them to agree it is done.</p>
						{/if}
					{/if}
				</Card.Content>
			</Card.Root>
		{/each}
	{:else if g.isFreeAgent}
		<p class="empty">Free agents take jobs rather than setting them.</p>
	{:else if g.myTargetId}
		{#if posting}
			<div class="form">
				<div>
					<Label for="offer">What are you putting up?</Label>
					<Input
						id="offer"
						bind:value={offer}
						placeholder="a bag of sour patch kids, my copy of Dune, a week of dish duty…"
					/>
				</div>
				<div>
					<Label for="held">Who is holding it?</Label>
					<Input
						id="held"
						bind:value={heldBy}
						placeholder="leave blank to hand it over yourself when it is done"
					/>
				</div>
				<div>
					<Label for="terms">Anything else</Label>
					<Textarea id="terms" bind:value={terms} placeholder="Where they live, when they walk…" />
				</div>
				<div class="row">
					<Button
						disabled={busy || !offer.trim()}
						onclick={() =>
							act({ action: 'post', offer, heldBy, terms }).then(() => (posting = false))}
					>
						Put it on the board
					</Button>
					<Button variant="ghost" onclick={() => (posting = false)}>Never mind</Button>
				</div>
				<p class="legal">
					Your name does not go on it. The board shows the mark and what is on
					the table, never who wants it done.
				</p>
			</div>
		{:else}
			<p>
				You are hunting <Who id={g.myTargetId} />. Put something up and somebody
				else will do it for you.
			</p>
			<Button class="mt-3" onclick={() => (posting = true)}>Post a contract</Button>
		{/if}
	{:else}
		<p class="empty">You have no target to put anything up for.</p>
	{/if}
</div>

{#if taken.length}
	<div class="block">
		<h3 class="rule">Jobs you have taken</h3>
		{#each taken as c (c.id)}
			<Card.Root class="mb-2">
				<Card.Header>
					<Card.Title class="font-serif text-xl font-normal">
						<Who id={c.markGmId} />
					</Card.Title>
					<Card.Description>
						Yours for <strong>{c.agreed}</strong> · {held(c.heldBy)}. Their file is
						open to you while this job is.
						{#if c.terms}<br />“{c.terms}”{/if}
					</Card.Description>
				</Card.Header>
				<Card.Content>
					{#if !c.settledByMe}
						<Button
							size="sm"
							disabled={busy}
							onclick={() => act({ action: 'settle', contractId: c.id })}
						>
							I got what I was owed
						</Button>
					{:else}
						<p class="legal">Waiting on the other side to agree it is done.</p>
					{/if}
				</Card.Content>
			</Card.Root>
		{/each}
	</div>
{/if}

<div class="block">
	<h3 class="rule">On the board — {open.length}</h3>
	{#if !open.length}
		<p class="empty">Nothing on the board.</p>
	{:else}
		<div class="board">
			{#each open as c (c.id)}
				<Card.Root>
					<Card.Header>
						<Card.Title class="font-serif text-xl font-normal">
							{#if c.onMe}
								<Badge variant="destructive">on you</Badge>
							{:else}
								<Who id={c.markGmId} />
							{/if}
						</Card.Title>
						<Card.Description>
							<strong>{c.offer}</strong><br />{held(c.heldBy)}
							{#if c.terms}<br />“{c.terms}”{/if}
						</Card.Description>
					</Card.Header>
					<Card.Content>
						{#if c.onMe}
							<p class="legal">Somebody wants you gone. You cannot bid on this one.</p>
						{:else if bidding === c.id}
							<div class="form">
								<div>
									<Label for="ask-{c.id}">What do you want for it?</Label>
									<Input id="ask-{c.id}" bind:value={ask} placeholder="what they offered, or say otherwise" />
								</div>
								<Textarea bind:value={pitch} placeholder="Why you…" />
								<div class="row">
									<Button
										size="sm"
										disabled={busy || !ask.trim()}
										onclick={() =>
											act({ action: 'bid', contractId: c.id, ask, pitch }).then(
												() => (bidding = null)
											)}
									>
										Offer
									</Button>
									<Button variant="ghost" size="sm" onclick={() => (bidding = null)}>Cancel</Button>
								</div>
							</div>
						{:else if c.myBid}
							<p class="legal">You asked for {c.myBid.ask}.</p>
							<Button
								variant="ghost"
								size="sm"
								disabled={busy}
								onclick={() => act({ action: 'withdraw', contractId: c.id })}
							>
								Withdraw
							</Button>
						{:else}
							<Button
								size="sm"
								onclick={() => {
									bidding = c.id;
									ask = c.offer;
									pitch = '';
								}}
							>
								Take this job
							</Button>
						{/if}
					</Card.Content>
				</Card.Root>
			{/each}
		</div>
	{/if}
	<p class="legal">
		Take a job and that mark's file opens to you for as long as the job is open,
		whether or not you have paid for anything. Nothing is settled through the
		app: you hand the thing over in person, and both of you say so here.
	</p>
</div>

<style>
	p {
		color: var(--color-dim);
		line-height: 1.65;
	}
	strong {
		color: var(--color-ink);
		font-weight: 400;
	}
	.board {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
		gap: 10px;
	}
	.form {
		display: grid;
		gap: 12px;
		max-width: 460px;
	}
	.row {
		display: flex;
		gap: 6px;
	}
</style>
