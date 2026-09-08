<script lang="ts">
	// One player's blocked-out hours, so you can see the gaps.
	import { game } from '$lib/game/store.svelte';
	import { DAYS, WEEK, dayOf, hhmm, place } from '$lib/game/time';
	import type { Player } from '$lib/game/types';

	let { player, px = 1.1 }: { player: Player; px?: number } = $props();
	const g = game();

	const START = 7 * 60;
	const END = 22 * 60;
	const height = $derived((END - START) * px);
	const hours = $derived(
		Array.from({ length: (END - START) / 60 + 1 }, (_, i) => START + i * 60)
	);
</script>

<div class="calendar">
	<div class="gutter" style="height:{height}px">
		{#each hours as t (t)}
			<div class="hour" style="top:{(t - START) * px}px">{hhmm(t).replace(':00', '')}</div>
		{/each}
	</div>
	{#each WEEK as d (d)}
		<div class="col">
			<div class="colhead">{DAYS[d]}</div>
			<div class="colbody" style="height:{height}px">
				{#each hours as t (t)}
					<div class="line" style="top:{(t - START) * px}px"></div>
				{/each}
				{#each dayOf(g.slots, player, d) as s (s.c.section + s.from)}
					<div
						class="slot"
						class:online={s.m.online}
						style="top:{(s.from - START) * px}px;height:{Math.max(20, (s.to - s.from) * px)}px"
						title="{s.c.section} {s.c.title ?? ''}&#10;{hhmm(s.from)}–{hhmm(s.to)}&#10;{place(
							s.m
						)}"
					>
						<div class="code">{s.c.section}</div>
						<div class="where">{place(s.m)}</div>
						<div class="when">{hhmm(s.from)}–{hhmm(s.to)}</div>
					</div>
				{/each}
			</div>
		</div>
	{/each}
</div>

<style>
	.calendar {
		display: grid;
		grid-template-columns: 54px repeat(5, 1fr);
		gap: 6px;
	}
	.gutter {
		position: relative;
	}
	.hour {
		position: absolute;
		right: 8px;
		transform: translateY(-50%);
		font-size: 10px;
		color: var(--color-faint);
	}
	.colhead {
		font: 500 10px/1 var(--font-mono);
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: var(--color-faint);
		padding-bottom: 7px;
	}
	.colbody {
		position: relative;
		background: var(--color-panel);
		border: 1px solid var(--color-line);
		border-radius: 3px;
		overflow: hidden;
	}
	.line {
		position: absolute;
		left: 0;
		right: 0;
		height: 1px;
		background: var(--color-line);
	}
	.slot {
		position: absolute;
		left: 3px;
		right: 3px;
		overflow: hidden;
		padding: 4px 6px;
		border-radius: 2px;
		background: color-mix(in oklch, var(--color-blood) 22%, var(--color-panel));
		border-left: 2px solid var(--color-blood);
	}
	.slot.online {
		background: var(--color-panel);
		border-left-color: var(--color-faint);
	}
	.code {
		font-size: 11px;
		color: var(--color-ink);
	}
	.where {
		font-size: 10px;
		color: var(--color-dim);
	}
	.when {
		font-size: 10px;
		color: var(--color-faint);
	}
</style>
