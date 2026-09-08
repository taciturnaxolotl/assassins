<script lang="ts">
	import { untrack } from 'svelte';
	import { page } from '$app/state';
	import { buttonVariants } from '$lib/components/ui/button';
	import * as Alert from '$lib/components/ui/alert';
	import CampusMap from '$lib/components/CampusMap.svelte';
	import { Game, provide } from '$lib/game/store.svelte';

	let { data } = $props();
	const why = $derived(page.url.searchParams.get('error'));

	// The map reads game context, so the demo gets a game of its own: one
	// invented player, no ring, nothing real in it. Built once — a fresh
	// invented person on every keystroke would be worse, not better.
	const g = untrack(
		() =>
			new Game({
				term: data.term,
				tier: 'pro',
				players: data.demo ? [data.demo] : [],
				campus: data.campus,
				roster: [],
				chain: { assigned: {}, kills: {}, myTarget: null, claimedKill: null, full: false },
				notes: {},
				me: null,
				isAdmin: false,
				isFreeAgent: false
			})
	);
	provide(g);

	// The store's copy, not the raw payload: one player, one identity.
	const demo = $derived(g.players[0] ?? null);

	let day = $state(untrack(() => data.day));
</script>

<svelte:head><title>Assassins {data.term}</title></svelte:head>

<header>
	<h1>Assassins <span class="year">26</span></h1>
	{#if data.signedIn}
		<div class="who">
			signed in as <strong>{data.signedIn.name}</strong>
		</div>
		<form method="POST" action="/auth/signout">
			<button class="out" type="submit">sign out</button>
		</form>
	{/if}
</header>

<main>
	{#if demo && g.campus}
		<figure>
			<CampusMap people={[demo]} {day} onday={(d) => (day = d)} />
			<figcaption>A random day on campus for {demo.name}</figcaption>
		</figure>
	{/if}

	<p>
		Welcome to the great Cedarville Assassins Game of 2026. You have been
		recruited for your very special set of skills to find, hunt down, and
		eliminate your target. You need a set of tools to complement those skills.
		Assassins Inc is prepared to help you by providing a lovely set of abilities
		to enhance your lethal ability.
	</p>

	{#if why}
		<Alert.Root variant="destructive" class="mb-4">
			<Alert.Description>{why}</Alert.Description>
		</Alert.Root>
	{/if}

	{#if data.signedIn}
		<a class={buttonVariants({ size: 'lg' })} href={data.signedIn.to}>Back to work</a>
	{:else}
		<a class={buttonVariants({ size: 'lg' })} href="/auth/google" data-sveltekit-reload>
			Beam me up Scotty
		</a>
	{/if}
</main>

<style>
	header {
		display: flex;
		align-items: baseline;
		gap: 20px;
		padding: 14px 22px;
		border-bottom: 1px solid var(--color-line);
	}
	.who {
		margin-left: auto;
		font-size: 11px;
		color: var(--color-faint);
	}
	.who strong {
		color: var(--color-dim);
		font-weight: 400;
	}
	.out {
		font: 400 10px/1 var(--font-mono);
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: var(--color-faint);
		background: none;
		border: 0;
		padding: 0;
		cursor: pointer;
	}
	.out:hover {
		color: var(--color-blood);
	}
	h1 {
		font: 400 30px/1 var(--font-serif);
	}
	.year {
		color: var(--color-blood);
		font-style: italic;
	}

	main {
		max-width: 780px;
		margin: 0 auto;
		padding: 26px 22px 60px;
	}

	figure {
		margin: 0 0 26px;
	}
	figcaption {
		margin-top: -8px;
		font-size: 11px;
		color: var(--color-faint);
	}

	p {
		color: var(--color-dim);
		line-height: 1.75;
		margin-bottom: 22px;
		max-width: 62ch;
	}
</style>
