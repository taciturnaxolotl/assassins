<script lang="ts">
	// What a free account sees where a dossier would be.
	//
	// The counts are real and about them; the map and the week below are not,
	// and are not theirs. Showing invented classes under a real person's name
	// would be worse than showing nothing — somebody un-blurs it in devtools and
	// goes to a building that student has never been in. So the sample is
	// openly a sample, and says so.
	import { buttonVariants } from '$lib/components/ui/button';
	import * as Table from '$lib/components/ui/table';
	import CampusMap from './CampusMap.svelte';
	import WeekGrid from './WeekGrid.svelte';
	import type { Teaser } from '$lib/server/data';
	import type { Player } from '$lib/game/types';

	let {
		name,
		teaser,
		sample = null,
		day = 1
	}: {
		name: string;
		teaser?: Teaser | null;
		/** An invented day, seeded so it holds still. Never the real one. */
		sample?: Player | null;
		day?: number;
	} = $props();

	const rows = $derived(
		teaser
			? ([
					['Photos', teaser.shots],
					['Sections this term', teaser.sections],
					['Meetings a week', teaser.meetings],
					['Buildings they sit in', teaser.buildings]
				].filter(([, n]) => (n as number) > 0) as [string, number][])
			: []
	);
</script>

<div class="locked">
	<h2>{name}</h2>
	<p>
		Their file is built and this account cannot read it. Reporting your draw
		and your kills is free; the dossiers are not.
	</p>

	{#if rows.length}
		<div class="tally">
			<Table.Root>
				<Table.Body>
					{#each rows as [label, n] (label)}
						<Table.Row>
							<Table.Cell class="text-[var(--color-faint)]">{label}</Table.Cell>
							<Table.Cell class="text-right">{n}</Table.Cell>
						</Table.Row>
					{/each}
					{#if teaser?.knowsDorm}
						<Table.Row>
							<Table.Cell class="text-[var(--color-faint)]">Hall and room</Table.Cell>
							<Table.Cell class="text-right">yes</Table.Cell>
						</Table.Row>
					{/if}
					{#if teaser?.knowsHometown}
						<Table.Row>
							<Table.Cell class="text-[var(--color-faint)]">Hometown</Table.Cell>
							<Table.Cell class="text-right">yes</Table.Cell>
						</Table.Row>
					{/if}
				</Table.Body>
			</Table.Root>
		</div>
	{/if}

	<a class={buttonVariants({ size: 'lg' })} href="/upgrade">Unlock the fancy tools</a>

	{#if sample}
		<div class="preview" aria-hidden="true">
			<div class="veil">
				<span>Sample, not theirs</span>
			</div>
			<div class="frosted">
				<h3 class="rule">Their route across campus</h3>
				<CampusMap people={[sample]} {day} compact />
				<h3 class="rule">Their week</h3>
				<WeekGrid player={sample} px={0.7} />
			</div>
		</div>
	{/if}
</div>

<style>
	h2 {
		font: 400 30px/1.05 var(--font-serif);
	}
	p {
		color: var(--color-dim);
		line-height: 1.65;
		margin: 10px 0 20px;
		max-width: 48ch;
	}
	.tally {
		max-width: 340px;
		margin-bottom: 22px;
	}

	.preview {
		position: relative;
		margin-top: 34px;
		border-top: 1px solid var(--color-line);
		padding-top: 20px;
		/* Nothing in here is real, so nothing in here is reachable. */
		pointer-events: none;
		user-select: none;
		overflow: hidden;
	}
	.frosted {
		filter: blur(7px) saturate(0.7);
		opacity: 0.55;
	}
	.veil {
		position: absolute;
		inset: 20px 0 0;
		z-index: 1;
		display: grid;
		place-items: center;
		background: linear-gradient(
			to bottom,
			color-mix(in oklch, var(--color-bg) 55%, transparent),
			var(--color-bg)
		);
	}
	.veil span {
		font: 400 10px/1 var(--font-mono);
		letter-spacing: 0.2em;
		text-transform: uppercase;
		color: var(--color-faint);
		border: 1px solid var(--color-line);
		background: var(--color-bg);
		padding: 6px 12px;
		border-radius: 999px;
	}
</style>
