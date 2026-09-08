<script lang="ts">
	// One list of everyone, used everywhere a name has to be chosen.
	import * as Select from '$lib/components/ui/select';
	import { game } from '$lib/game/store.svelte';

	let {
		value = '',
		placeholder,
		unknown,
		onpick
	}: {
		value?: string;
		placeholder: string;
		unknown?: string;
		onpick: (v: string) => void;
	} = $props();

	const g = game();
	const label = $derived(
		value === '' ? placeholder : value === '?' ? (unknown ?? '—') : g.name(value)
	);
</script>

<Select.Root type="single" {value} onValueChange={onpick}>
	<Select.Trigger class="w-full">{label}</Select.Trigger>
	<Select.Content>
		<Select.Item value="">{placeholder}</Select.Item>
		{#if unknown}<Select.Item value="?">{unknown}</Select.Item>{/if}
		<Select.Separator />
		{#each g.alphabetical as p (p.gmId)}
			<Select.Item value={p.gmId}>{p.name}{g.dead(p.gmId) ? ' ✝' : ''}</Select.Item>
		{/each}
	</Select.Content>
</Select.Root>
