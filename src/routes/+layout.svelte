<script lang="ts">
	import { page } from '$app/state';
	import '../app.css';
	import SpoofBar from '$lib/components/SpoofBar.svelte';

	let { data, children } = $props();

	// Scrapers do not resolve relative image paths, and only the request knows
	// what host it arrived on — the tunnel, the workers.dev name, or whatever it
	// is pointed at next.
	const origin = $derived(page.url.origin);
</script>

<svelte:head>
	<meta property="og:url" content={page.url.href} />
	<meta property="og:image" content="{origin}/og.png" />
	<meta name="twitter:image" content="{origin}/og.png" />
</svelte:head>

{#if data.spoof}
	<SpoofBar as={data.spoof.as} writing={data.spoof.writing} />
{/if}

{@render children()}
