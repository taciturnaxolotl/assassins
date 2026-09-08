<script lang="ts">
	import Dossier from '$lib/components/Dossier.svelte';
	import Locked from '$lib/components/Locked.svelte';
	import PlayerCombobox from '$lib/components/PlayerCombobox.svelte';
	import { Button } from '$lib/components/ui/button';
	import * as Alert from '$lib/components/ui/alert';
	import { game } from '$lib/game/store.svelte';

	let { data } = $props();
	const g = game();

	let picked = $state('');
	let busy = $state(false);
	let err = $state('');

	const markId = $derived(g.myTargetId);
	const mark = $derived(g.myTarget);
	const options = $derived(g.alphabetical.map((p) => ({ ...p, dead: g.dead(p.gmId) })));
	const waiting = $derived(g.tier === 'pending');

	// markId comes from the ring, not from local state, so backing out means
	// dropping the row rather than clearing the picker.
	async function clear() {
		busy = true;
		err = '';
		try {
			await g.assign(g.me!, null);
			picked = '';
		} catch (e) {
			err = (e as Error).message;
		} finally {
			busy = false;
		}
	}

	async function commit() {
		if (!picked) return;
		busy = true;
		err = '';
		try {
			await g.assign(g.me!, picked);
			// Filing a draw swaps this whole screen for the dossier, so the button
			// stays dead rather than flicking back to clickable on the way out.
		} catch (e) {
			err = (e as Error).message;
			busy = false;
		}
	}
</script>

<svelte:head><title>Target · Assassins</title></svelte:head>

{#if g.isFreeAgent}
	<div class="brief">
		<h1>Free agent</h1>
		<p>
			You are outside the ring. Nobody drew you and you drew nobody, so there is
			no assignment here. Work comes off <a href="/jobs">the board</a>, and a job
			you take opens that mark's file for as long as you hold it.
		</p>
		<Button href="/jobs" size="lg">See the board</Button>
	</div>
{:else if !g.me}
	<p class="empty">Your claim has not been approved yet.</p>
{:else if g.won}
	<div class="brief">
		<h1>You won</h1>
		<p>
			The ring closed on you. Everybody else is out, and the only name left on
			your slip is your own.
		</p>
	</div>
{:else if g.dead(g.me)}
	<div class="brief">
		<h1>You are out</h1>
		<p>
			{#if g.chain.kills[g.me]}
				{g.name(g.chain.kills[g.me])} got you, and inherited whoever you were
				hunting.
			{:else}
				Somebody got you. Nobody has claimed it.
			{/if}
		</p>
	</div>
{:else if !markId}
	<div class="brief">
		<h1>Your assignment</h1>
		<p>
			Your dispatcher should have sent you your target either via GroupMe or
			email. Enter your target's name.
		</p>

		<PlayerCombobox
			{options}
			bind:value={picked}
			exclude={g.me}
			placeholder="Search the roster…"
		/>

		{#if err}
			<Alert.Root variant="destructive"><Alert.Description>{err}</Alert.Description></Alert.Root>
		{/if}

		<Button size="lg" disabled={!picked || busy} onclick={commit}>
			{busy ? 'filing…' : 'Assassinate them'}
		</Button>

	</div>
{:else if mark}
	{@render reported()}
	<Dossier player={mark} wide />
{:else if waiting}
	<div class="brief">
		<h1>Filed</h1>
		<p>
			You are down as hunting {g.name(markId)}. Their file opens once somebody
			confirms you are who you say you are.
		</p>
		<Button variant="outline" disabled={busy} onclick={clear}>Change my target</Button>
		{#if err}
			<Alert.Root variant="destructive"><Alert.Description>{err}</Alert.Description></Alert.Root>
		{/if}
	</div>
{:else}
	{@render reported()}
	<Locked name={g.name(markId)} teaser={data.pitch} sample={g.byId.get('demo') ?? null} day={data.day} />
{/if}

<!-- Shown whether or not this account can read the file, because the state it
     describes is about the ring rather than the dossier. -->
{#snippet reported()}
	{#if markId && g.claimedKill === markId}
		<Alert.Root class="mb-4">
			<Alert.Description>
				You have reported taking out {g.name(markId)}. They stay your target, and
				you inherit theirs, once somebody confirms it.
			</Alert.Description>
		</Alert.Root>
	{/if}
{/snippet}

<style>
	/* Same shape as the briefing that got them here. */
	/* The block is wide enough for the roster control to be worth clicking; the
	   prose inside keeps its own measure so it stays readable. */
	.brief {
		display: grid;
		place-items: center;
		gap: 20px;
		justify-items: center;
		width: min(74ch, 100%);
		margin: 12vh auto;
		text-align: center;
	}
	.brief > :global(*) {
		width: 100%;
	}
	.brief > :global(button) {
		width: auto;
	}
	h1 {
		font: 400 clamp(30px, 5vw, 40px) / 1.12 var(--font-serif);
		margin: 0;
	}
	p {
		color: var(--color-dim);
		line-height: 1.7;
		font-size: 15px;
		margin: 0;
		max-width: 46ch;
	}
	a {
		color: var(--color-blood);
		text-decoration: underline;
	}

</style>
