<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	let { data } = $props();
</script>

<svelte:head><title>Turned down · Assassins</title></svelte:head>

<header>
	<h1>Assassins <span class="year">26</span></h1>
</header>

<main>
	<p>
		Your application to play as <strong>{data.as}</strong> was turned down.
		{#if data.verdict}The reason given: {data.verdict}{/if}
	</p>
	<p class="legal">
		If that is a mistake, say so in the GroupMe. There is no way to reapply from
		this page.
	</p>

	<form method="POST" action="/auth/signout">
		<Button variant="outline" size="sm" type="submit">Sign out</Button>
	</form>
</main>

<style>
	header {
		padding: 14px 22px;
		border-bottom: 1px solid var(--color-line);
	}
	h1 {
		font: 400 30px/1 var(--font-serif);
	}
	.year {
		color: var(--color-blood);
		font-style: italic;
	}
	main {
		max-width: 52ch;
		padding: 30px 22px;
	}
	p {
		color: var(--color-dim);
		line-height: 1.65;
		margin-bottom: 14px;
	}
	strong {
		color: var(--color-ink);
		font-weight: 400;
	}
	.legal {
		margin-bottom: 22px;
	}
</style>
