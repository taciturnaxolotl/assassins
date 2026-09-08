<script lang="ts">
	// A player's name, anywhere. Every one of them goes to the same page the
	// Target tab renders, so there is only ever one detail view to keep honest.
	import { game } from '$lib/game/store.svelte';

	let { id }: { id: string | null | undefined } = $props();
	const g = game();
</script>

{#if id}
	<a class="who" class:gone={g.dead(id)} href="/player/{id}">{g.name(id)}</a>
{:else}
	<span class="faint">—</span>
{/if}
