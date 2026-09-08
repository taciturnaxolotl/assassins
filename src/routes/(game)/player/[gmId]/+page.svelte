<script lang="ts">
	import Dossier from '$lib/components/Dossier.svelte';
	import { game } from '$lib/game/store.svelte';

	let { data } = $props();
	const g = game();

	const player = $derived(g.byId.get(data.gmId) ?? null);
	const name = $derived(player?.name ?? g.name(data.gmId) ?? 'Unknown');
</script>

<svelte:head><title>{name} · Assassins</title></svelte:head>

{#if player}
	<Dossier {player} wide />
{:else}
	<p class="empty">Nobody by that name.</p>
{/if}

<style>
	.empty {
		color: var(--color-dim);
		font-style: italic;
	}
</style>
