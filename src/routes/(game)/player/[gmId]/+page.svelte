<script lang="ts">
	import Dossier from '$lib/components/Dossier.svelte';
	import Locked from '$lib/components/Locked.svelte';
	import { game } from '$lib/game/store.svelte';

	let { data } = $props();
	const g = game();

	// The store only holds files this account may read, so its absence is the
	// answer rather than something to check for separately.
	const player = $derived(g.byId.get(data.gmId) ?? null);
</script>

<svelte:head><title>{data.name} · Assassins</title></svelte:head>

{#if player}
	<Dossier {player} wide />
{:else}
	<Locked name={data.name} teaser={data.pitch} />
{/if}
