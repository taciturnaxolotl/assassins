<script lang="ts">
	// A player's name, anywhere. Clicking one opens the same dossier the Target
	// tab shows, which is why there is only ever one detail view to maintain.
	import { game } from '$lib/game/store.svelte';

	let { id }: { id: string | null | undefined } = $props();
	const g = game();
</script>

{#if id}
	<button class="who" class:gone={g.dead(id)} onclick={() => g.show(id)}>{g.name(id)}</button>
{:else}
	<span class="faint">—</span>
{/if}
