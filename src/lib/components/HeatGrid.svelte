<script lang="ts">
	// Half hour by half hour, how much of the game is pinned down and where. The
	// quiet cells are when people are loose on campus.
	import { game } from '$lib/game/store.svelte';
	import { DAYS, WEEK, hhmm, place } from '$lib/game/time';

	const g = game();
	const START = 7 * 60;
	const END = 22 * 60;

	const rows = $derived.by(() => {
		const living = new Set(g.players.filter((p) => !g.dead(p.gmId)).map((p) => p.gmId));
		const out = [];
		for (let t = START; t < END; t += 30) {
			const cells = WEEK.map((d) => {
				const here = g.slots.filter(
					(s) => s.day === d && s.from < t + 30 && s.to > t && living.has(s.p.gmId)
				);
				const rooms = new Map<string, number>();
				for (const s of here) {
					const k = s.m.building ?? place(s.m);
					rooms.set(k, (rooms.get(k) ?? 0) + 1);
				}
				return {
					n: here.length,
					rooms: [...rooms.entries()].sort((a, b) => b[1] - a[1])
				};
			});
			out.push({ t, cells });
		}
		return out;
	});

	const peak = $derived(Math.max(1, ...rows.flatMap((r) => r.cells.map((c) => c.n))));
</script>

<div class="heat">
	<div class="row head">
		<div class="time"></div>
		{#each WEEK as d (d)}<div class="cell">{DAYS[d]}</div>{/each}
	</div>
	{#each rows as r (r.t)}
		<div class="row">
			<div class="time">{r.t % 60 === 0 ? hhmm(r.t).replace(':00', '') : ''}</div>
			{#each r.cells as c, i (i)}
				<div
					class="cell"
					style="--fill:{(c.n / peak).toFixed(3)}"
					title={c.rooms.map(([k, n]) => `${n} in ${k}`).join('\n')}
				>
					{#if c.n}<span>{c.n}</span>{/if}
					{#if c.rooms[0] && c.n > peak * 0.25}<small>{c.rooms[0][0]}</small>{/if}
				</div>
			{/each}
		</div>
	{/each}
</div>

<style>
	.heat {
		display: grid;
		gap: 2px;
	}
	.row {
		display: grid;
		grid-template-columns: 54px repeat(5, 1fr);
		gap: 2px;
	}
	.time {
		font-size: 10px;
		color: var(--color-faint);
		text-align: right;
		padding-right: 8px;
	}
	.cell {
		min-height: 22px;
		padding: 3px 6px;
		border-radius: 2px;
		background: color-mix(in oklch, var(--color-blood) calc(var(--fill, 0) * 70%), var(--color-panel));
		font-size: 11px;
		display: flex;
		align-items: center;
		gap: 6px;
	}
	.row.head .cell {
		background: none;
		font: 500 10px/1 var(--font-mono);
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: var(--color-faint);
	}
	small {
		color: var(--color-dim);
		font-size: 9px;
		overflow: hidden;
		white-space: nowrap;
	}
</style>
