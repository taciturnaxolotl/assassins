<script lang="ts">
	import { untrack } from 'svelte';
	import { page } from '$app/state';
	import { Game, provide } from '$lib/game/store.svelte';
	import { DAYS, hhmm } from '$lib/game/time';

	let { data, children } = $props();

	const g = new Game(untrack(() => data));
	provide(g);

	// The server is the source of truth; a navigation refills the store rather
	// than leaving two copies to disagree.
	$effect(() => g.absorb(data));

	$effect(() => {
		const t = setInterval(() => (g.now = new Date()), 30_000);
		return () => clearInterval(t);
	});

	// What a player gets. The roster and the campus map are for running the
	// game, not playing it: browsing all seventy-nine files is a different thing
	// from hunting one person, and it is not what anybody paid for.
	const TABS = [
		['/target', 'Target'],
	] as const;

	// Your own file, which is the one you are least able to look up any other
	// way — the roster is not for players and searching for yourself is odd.
	// A free agent is nobody on the roster, so there is nothing to show them.
	const mine = $derived(g.me ? `/player/${g.me}` : null);

	const RUNNING = [
		['/roster', 'Roster'],
		['/campus', 'Campus'],
		['/chain', 'Chain']
	] as const;

	const waiting = $derived(g.tier === 'pending');

</script>

<svelte:head>
	<!-- A shared link to any of these must not put somebody's name in a preview
	     card, so they all describe the game rather than the page. -->
	<meta property="og:title" content="Assassins 26" />
	<meta property="og:description" content="Let the games begin" />
</svelte:head>

<header>
	<h1>Assassins <span class="year">26</span></h1>
	<div class="tally">{g.living} alive / {g.roster.length} · {g.term}</div>

	<nav>
		{#each TABS as [href, label] (href)}
			<a {href} class:on={page.url.pathname === href}>{label}</a>
		{/each}
		{#if mine}
			<a href={mine} class:on={page.url.pathname === mine}>You</a>
		{/if}
		{#if g.isAdmin}
			{#each RUNNING as [href, label] (href)}
				<a {href} class:on={page.url.pathname === href}>{label}</a>
			{/each}
		{/if}
	</nav>

	<div class="right">
		<span class="clock">{DAYS[g.day]} {hhmm(g.minutes)}</span>
		{#if g.isAdmin}<a class="admin" href="/admin">queue</a>{/if}
		<form method="POST" action="/auth/signout">
			<button class="out" type="submit">sign out</button>
		</form>
	</div>
</header>

{#if waiting}
	<div class="strip">
		<span>
			Your claim is in the queue. You can file your draw now; the file opens once
			somebody confirms it is you.
		</span>
	</div>
{/if}

<main>
	{@render children()}
</main>

<style>
	header {
		position: sticky;
		top: 0;
		z-index: 5;
		display: flex;
		align-items: baseline;
		gap: 20px;
		padding: 14px 22px;
		background: color-mix(in oklch, var(--color-bg) 88%, transparent);
		backdrop-filter: blur(10px);
		border-bottom: 1px solid var(--color-line);
	}
	h1 {
		font: 400 30px/1 var(--font-serif);
	}
	.year {
		color: var(--color-blood);
		font-style: italic;
	}
	.tally {
		color: var(--color-faint);
		letter-spacing: 0.06em;
		text-transform: uppercase;
		font-size: 11px;
	}

	nav {
		display: flex;
		gap: 2px;
	}
	nav a {
		font: 400 11px/1 var(--font-mono);
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: var(--color-faint);
		border-bottom: 2px solid transparent;
		padding: 8px 10px;
	}
	nav a:hover {
		color: var(--color-ink);
	}
	nav a.on {
		color: var(--color-blood);
		border-bottom-color: var(--color-blood);
	}

	.right {
		margin-left: auto;
		display: flex;
		align-items: baseline;
		gap: 14px;
	}
	.clock {
		color: var(--color-dim);
		font-variant-numeric: tabular-nums;
	}
	.admin,
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
	.admin:hover,
	.out:hover {
		color: var(--color-blood);
	}

	.strip {
		padding: 9px 22px;
		font-size: 11px;
		color: var(--color-warn);
		background: color-mix(in oklch, var(--color-warn) 9%, var(--color-bg));
		border-bottom: 1px solid color-mix(in oklch, var(--color-warn) 25%, transparent);
	}

	main {
		padding: 22px;
	}

	@media (max-width: 780px) {
		header {
			flex-wrap: wrap;
			gap: 10px 16px;
		}
		.right {
			width: 100%;
			margin-left: 0;
		}
	}
</style>
