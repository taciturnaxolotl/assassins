<script lang="ts">
	import '../app.css';
	import SpoofBar from '$lib/components/SpoofBar.svelte';

	let { data, children } = $props();
</script>

{#if data.spoof}
	<SpoofBar as={data.spoof.as} writing={data.spoof.writing} />
{/if}

{@render children()}
