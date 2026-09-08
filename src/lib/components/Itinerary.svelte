<script lang="ts">
	// A day as a list of places, each with the walk that gets there. Under three
	// minutes of slack turns the row red, because that is when someone is
	// definitely on that path at that minute.
	import { game } from '$lib/game/store.svelte';
	import { DAYS, hhmm, place } from '$lib/game/time';
	import { slack } from '$lib/game/route';
	import type { Player } from '$lib/game/types';

	let { player, day }: { player: Player; day: number } = $props();
	const g = game();
	const plan = $derived(g.walker!.plan(g.slots, player, day));
</script>

{#if !plan.stops.length}
	<p class="empty">Nothing on {DAYS[day]}.</p>
{:else}
	<div class="scroller"><table class="sheet">
		<thead>
			<tr>
				{#each ['At', 'Where', 'Course', 'Walk', 'Slack'] as h (h)}<th>{h}</th>{/each}
			</tr>
		</thead>
		<tbody>
			{#if player.dorm}
				<!-- Nobody reports what time they leave, so the row says so rather
				     than inventing one. It still earns its place: it is the first
				     place they are, and the walk that follows starts there. -->
				<tr class="home">
					<td class="faint">—</td>
					<td class="place">{[player.dorm, player.room].filter(Boolean).join(' ')}</td>
					<td class="faint">home</td>
					<td class="faint">{plan.home == null ? 'off the map' : 'start of day'}</td>
					<td class="faint">—</td>
				</tr>
			{/if}
			<!-- By position: a section can meet in two rooms at the same hour, and
			     both are places they might be. -->
			{#each plan.stops as stop, i (i)}
				{@const left = slack(stop.leg)}
				<tr class:tight={left != null && left < 3}>
					<td>{hhmm(stop.s.from)}</td>
					<td class="place">{place(stop.s.m)}</td>
					<td class="code">{stop.s.c.section}</td>
					<td>
						{stop.leg
							? `${stop.leg.minutes} min · ${stop.leg.metres} m`
							: stop.node == null
								? 'off the map'
								: 'already there'}
					</td>
					<td>{left == null ? '—' : `${left} min`}</td>
				</tr>
			{/each}
		</tbody>
	</table></div>
	{#if plan.homeless}
		<p class="legal">
			{player.dorm} is not on the map yet, so the first walk of the day is missing.
		</p>
	{/if}
{/if}

<style>
	tr.home td {
		color: var(--color-dim);
	}
	tr.home td.place {
		color: var(--color-live);
	}
</style>
