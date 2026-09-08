<script lang="ts">
	// The drawer. Anyone clicked anywhere in the app opens here, in the same
	// component the Target page renders wide, so there is only ever one detail
	// view to keep honest.
	import * as Sheet from '$lib/components/ui/sheet';
	import Dossier from './Dossier.svelte';
	import Locked from './Locked.svelte';
	import { game } from '$lib/game/store.svelte';

	const g = game();
	const player = $derived(g.sheet ? (g.byId.get(g.sheet) ?? null) : null);
</script>

<Sheet.Root open={!!g.sheet} onOpenChange={(o) => !o && g.hide()}>
	<Sheet.Content side="right" class="w-full sm:max-w-[480px] overflow-y-auto p-5 pb-16">
		<Sheet.Header class="sr-only">
			<Sheet.Title>{player?.name ?? g.name(g.sheet)}</Sheet.Title>
		</Sheet.Header>
		{#if player}
			<Dossier {player} />
		{:else if g.sheet}
			<Locked name={g.name(g.sheet)} />
		{/if}
	</Sheet.Content>
</Sheet.Root>
