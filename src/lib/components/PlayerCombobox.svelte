<script lang="ts">
	// Ninety-nine names is exactly the size where a dropdown stops working and
	// typing three letters starts. It takes its roster as a prop rather than
	// reading game context, because the claim screen needs one before the player
	// is in the game at all.
	import { tick } from 'svelte';
	import * as Command from '$lib/components/ui/command';
	import * as Popover from '$lib/components/ui/popover';
	import { Button } from '$lib/components/ui/button';

	export type Option = { gmId: string; name: string; dead?: boolean; taken?: boolean };

	let {
		options,
		value = $bindable(''),
		placeholder = 'Search the roster…',
		exclude = null,
		extras = [],
		onpick
	}: {
		options: Option[];
		value?: string;
		placeholder?: string;
		exclude?: string | null;
		/** Rows that are not players: "not known", "killer unknown", and so on. */
		extras?: { value: string; label: string }[];
		onpick?: (v: string) => void;
	} = $props();

	let open = $state(false);
	let trigger = $state<HTMLButtonElement>(null!);

	const shown = $derived(options.filter((p) => p.gmId !== exclude));
	const label = $derived(
		extras.find((e) => e.value === value)?.label ??
			shown.find((p) => p.gmId === value)?.name ??
			placeholder
	);

	function choose(gmId: string) {
		value = gmId;
		open = false;
		onpick?.(gmId);
		tick().then(() => trigger?.focus());
	}
</script>

<div class="combo">
	<Popover.Root bind:open>
		<Popover.Trigger bind:ref={trigger}>
			{#snippet child({ props })}
			<Button
				{...props}
				variant="outline"
				role="combobox"
				aria-expanded={open}
				class="w-full justify-between font-normal {value ? '' : 'text-muted-foreground'}"
			>
				{label}
				<span aria-hidden="true">▾</span>
			</Button>
			{/snippet}
		</Popover.Trigger>
		<Popover.Content class="w-[var(--bits-popover-anchor-width)] p-0" align="start">
		<Command.Root>
			<Command.Input placeholder="Type a name…" />
			<Command.List>
				<Command.Empty>Nobody by that name.</Command.Empty>
				{#if extras.length}
					<Command.Group>
						{#each extras as e (e.value)}
							<Command.Item value={e.label} onSelect={() => choose(e.value)}>
								{e.label}
							</Command.Item>
						{/each}
					</Command.Group>
					<Command.Separator />
				{/if}
				<Command.Group>
					{#each shown as p (p.gmId)}
						<Command.Item
							value={p.name}
							disabled={p.taken}
							onSelect={() => !p.taken && choose(p.gmId)}
						>
							{p.name}{p.dead ? ' ✝' : ''}{p.taken ? ' — claimed' : ''}
						</Command.Item>
					{/each}
				</Command.Group>
			</Command.List>
		</Command.Root>
		</Popover.Content>
</Popover.Root>
</div>

<style>
	/* The trigger fills whatever it is given. bits-ui may or may not render a
	   host element for it, so the width is pinned here rather than hoped for
	   through a `> *` selector in the parent. */
	.combo {
		display: block;
		width: 100%;
	}
	.combo :global(> button) {
		width: 100%;
	}
</style>
