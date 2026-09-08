<script lang="ts">
	import CampusMap from '$lib/components/CampusMap.svelte';
	import HeatGrid from '$lib/components/HeatGrid.svelte';
	import Who from '$lib/components/Who.svelte';
	import { game } from '$lib/game/store.svelte';
	import { CLASS, DAYS, hhmm, place } from '$lib/game/time';

	const g = game();
	let day = $state(new Date().getDay());

	const living = $derived(g.players.filter((p) => !g.dead(p.gmId)));
	const nowIn = $derived(
		g.slots.filter((s) => s.day === g.day && s.from <= g.minutes && g.minutes < s.to)
	);
	const soon = $derived(
		g.slots.filter(
			(s) => s.day === g.day && s.from > g.minutes && s.from <= g.minutes + 180
		)
	);

	const dorms = $derived.by(() => {
		const by = new Map<string, typeof g.players>();
		for (const p of g.players) {
			const k = p.dorm ?? 'unknown';
			if (!by.has(k)) by.set(k, []);
			by.get(k)!.push(p);
		}
		return [...by.entries()]
			.sort((a, b) => b[1].length - a[1].length)
			.map(([dorm, ps]) => ({
				dorm,
				ps: [...ps].sort((a, b) => (a.room ?? '').localeCompare(b.room ?? ''))
			}));
	});

	const shared = $derived.by(() => {
		const by = new Map<string, { c: (typeof g.players)[0]['schedule'] extends (infer C)[] | undefined ? C : never; players: typeof g.players }>();
		for (const p of g.players)
			for (const c of p.schedule ?? []) {
				if (!by.has(c.section)) by.set(c.section, { c, players: [] });
				by.get(c.section)!.players.push(p);
			}
		return [...by.values()]
			.filter((x) => x.players.length > 1)
			.sort(
				(a, b) => b.players.length - a.players.length || a.c.section.localeCompare(b.c.section)
			);
	});
</script>

<svelte:head><title>Campus · Assassins</title></svelte:head>

<div class="block">
	<h3 class="rule">Campus traffic — {DAYS[day]}</h3>
	<CampusMap people={living} {day} onday={(d) => (day = d)} />
	<p class="legal">
		Heavier lines carry more of the game. Scroll to zoom, drag to pan.
		{#if g.campus?.missing?.length}
			Not on the map yet: {g.campus.missing.join(', ')}.
		{/if}
	</p>
</div>

{#snippet table(title: string, rows: typeof nowIn, showEnd: boolean)}
	<div class="block">
		<h3 class="rule">{title}{rows.length ? ` — ${rows.length}` : ''}</h3>
		{#if !rows.length}
			<p class="empty">nobody</p>
		{:else}
			<div class="scroller"><table class="sheet">
				<thead>
					<tr>
						<th>Who</th><th>{showEnd ? 'Until' : 'At'}</th><th>Where</th><th>Course</th>
					</tr>
				</thead>
				<tbody>
					<!-- Keyed by position: a section can meet twice at the same hour on
					     the same day, in two rooms, so nothing about it is unique. -->
					{#each rows as s, i (i)}
						<tr class:gone={g.dead(s.p.gmId)}>
							<td><Who id={s.p.gmId} /></td>
							<td>{hhmm(showEnd ? s.to : s.from)}</td>
							<td class="place">{place(s.m)}</td>
							<td class="code">{s.c.section}</td>
						</tr>
					{/each}
				</tbody>
			</table></div>
		{/if}
	</div>
{/snippet}

{@render table('In class right now', nowIn, true)}
{@render table('Next three hours', soon, false)}

<div class="block">
	<h3 class="rule">When the game is pinned down</h3>
	<HeatGrid />
</div>

<div class="block">
	<h3 class="rule">By dorm</h3>
	{#each dorms as { dorm, ps } (dorm)}
		<details class="fold">
			<summary>{dorm} — {ps.length}</summary>
			<div class="scroller"><table class="sheet">
				<thead>
					<tr>
						<th>Room</th><th>Who</th><th>Class</th>
						{#if g.seesRing}<th>Hunting</th>{/if}
					</tr>
				</thead>
				<tbody>
					{#each ps as p (p.gmId)}
						<tr class:gone={g.dead(p.gmId)}>
							<td>{p.room ?? ''}</td>
							<td><Who id={p.gmId} /></td>
							<td>{CLASS[p.class ?? ''] ?? ''}</td>
							{#if g.seesRing}<td><Who id={g.target(p.gmId)} /></td>{/if}
						</tr>
					{/each}
				</tbody>
			</table></div>
		</details>
	{/each}
</div>

<div class="block">
	<h3 class="rule">Shared sections</h3>
	<details class="fold">
		<summary>{shared.length} sections hold more than one player</summary>
		<div class="scroller"><table class="sheet">
			<thead>
				<tr><th>Section</th><th>Course</th><th>When</th><th>Where</th><th>Players</th></tr>
			</thead>
			<tbody>
				{#each shared as { c, players } (c.section)}
					<tr>
						<td class="code">{c.section}</td>
						<td>{c.title ?? ''}</td>
						<td>
							{(c.meets ?? [])
								.map((m) => `${m.days.map((d) => DAYS[d]).join('')} ${m.start ?? ''}`)
								.join(' / ')}
						</td>
						<td class="place">{(c.meets ?? []).map(place).join(' / ')}</td>
						<td>
							{#each players as p, i (p.gmId)}
								{#if i}<span class="faint">, </span>{/if}<Who id={p.gmId} />
							{/each}
						</td>
					</tr>
				{/each}
			</tbody>
		</table></div>
	</details>
</div>
