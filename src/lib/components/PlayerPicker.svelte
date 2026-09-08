<script lang="ts">
	// Wherever a name has to be chosen from the whole roster. Ninety-nine
	// options is well past what a plain select is good for, so this is the
	// searchable one with the picker's two extra rows on top.
	import PlayerCombobox from './PlayerCombobox.svelte';
	import { game } from '$lib/game/store.svelte';

	let {
		value = '',
		placeholder,
		unknown,
		exclude = null,
		onpick
	}: {
		value?: string;
		placeholder: string;
		unknown?: string;
		/** Somebody who cannot be the answer — usually whoever the row is about. */
		exclude?: string | null;
		onpick: (v: string) => void;
	} = $props();

	const g = game();
	const options = $derived(
		g.alphabetical.map((p) => ({ ...p, dead: g.dead(p.gmId) }))
	);
	const extras = $derived([
		{ value: '', label: placeholder },
		...(unknown ? [{ value: '?', label: unknown }] : [])
	]);

</script>

<PlayerCombobox {options} {extras} {placeholder} {value} {exclude} {onpick} />
