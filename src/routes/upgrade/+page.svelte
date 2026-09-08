<script lang="ts">
	import { Button } from '$lib/components/ui/button';
</script>

<svelte:head><title>Billing · Assassins</title></svelte:head>

<header>
	<a href="/target">← back</a>
</header>

<main>
	<h1>Unlocked</h1>
	<p>The files are open to you. Nothing else to do here.</p>
	<form method="POST" action="/api/billing/portal">
		<Button variant="outline" type="submit">Manage billing</Button>
	</form>
</main>

<style>
	header {
		padding: 14px 22px;
		border-bottom: 1px solid var(--color-line);
	}
	header a {
		font-size: 11px;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--color-faint);
	}
	header a:hover {
		color: var(--color-blood);
	}
	main {
		max-width: 520px;
		padding: 30px 22px;
	}
	h1 {
		font: 400 32px/1.05 var(--font-serif);
	}
	p {
		color: var(--color-dim);
		line-height: 1.65;
		margin: 12px 0 24px;
	}
</style>
