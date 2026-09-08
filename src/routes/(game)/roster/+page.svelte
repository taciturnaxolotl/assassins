<script lang="ts">
	import Photo from '$lib/components/Photo.svelte';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import * as InputGroup from '$lib/components/ui/input-group';
	import SearchIcon from '@lucide/svelte/icons/search';
	import { game } from '$lib/game/store.svelte';
	import { CLASS, place } from '$lib/game/time';

	const g = game();
	let q = $state('');
	let on = $state(new Set<string>());

	const FILTERS = [
		{ id: 's:alive', label: 'alive', has: (id: string) => !g.dead(id) },
		{ id: 's:dead', label: 'eliminated', has: (id: string) => g.dead(id) },
		...['FR', 'SO', 'JR', 'SR'].map((c) => ({
			id: 'c:' + c,
			label: c,
			has: (id: string) => g.roster.find((r) => r.gmId === id)?.class === c
		})),
		{
			id: 'x:unknown',
			label: 'unidentified',
			has: (id: string) => g.roster.find((r) => r.gmId === id)?.matched === false
		},
		// Only whoever runs the game can tell who has not reported a draw.
		...(g.seesRing
			? [
					{
						id: 'x:orphan',
						label: 'no draw reported',
						has: (id: string) => !g.dead(id) && !g.target(id)
					}
				]
			: [])
	];

	// Search reaches over whatever the projection sent. That is names, halls and
	// majors for a player, and course codes and buildings for whoever runs the
	// game — the same expression either way, because the missing fields are
	// simply absent rather than blanked.
	const haystack = $derived.by(() => {
		const m = new Map<string, string>();
		for (const r of g.roster) {
			const p = g.byId.get(r.gmId);
			m.set(
				r.gmId,
				[
					r.name,
					p?.legalName,
					p?.dorm,
					p?.room,
					p?.hometown,
					CLASS[r.class ?? ''],
					...(p?.majors ?? []).map((x) => x.major),
					...(p?.schedule ?? []).flatMap((c) => [
						c.code,
						c.title,
						...(c.meets ?? []).map(place)
					])
				]
					.filter(Boolean)
					.join(' ')
					.toLowerCase()
			);
		}
		return m;
	});

	/**
	 * How well someone matches what you typed. A name beats a hometown, and the
	 * start of a name beats the middle of one, so typing three letters puts the
	 * person you meant first instead of alphabetically among everyone whose dorm
	 * happens to contain them.
	 */
	function score(gmId: string, name: string) {
		if (!q) return 1;
		const n = name.toLowerCase();
		if (n.startsWith(q)) return 100;
		if (n.split(/\s+/).some((w) => w.startsWith(q))) return 80;
		if (n.includes(q)) return 60;
		const hay = haystack.get(gmId) ?? '';
		return hay.includes(q) ? 20 : 0;
	}

	const shown = $derived(
		g.alphabetical
			.filter((r) => FILTERS.every((f) => !on.has(f.id) || f.has(r.gmId)))
			.map((r) => ({ r, s: score(r.gmId, r.name) }))
			.filter((x) => x.s > 0)
			.sort((a, b) => b.s - a.s || a.r.name.localeCompare(b.r.name))
			.map((x) => x.r)
	);

	const toggle = (id: string) => {
		on.has(id) ? on.delete(id) : on.add(id);
		on = new Set(on);
	};
</script>

<svelte:head><title>Roster · Assassins</title></svelte:head>

<div class="controls">
	<InputGroup.Root class="search">
		<InputGroup.Input
			type="search"
			autocomplete="off"
			placeholder={g.unlocked ? 'name, dorm, course, hometown…' : 'name, hall, major…'}
			oninput={(e) => (q = e.currentTarget.value.trim().toLowerCase())}
		/>
		<InputGroup.Addon>
			<SearchIcon class="size-4 shrink-0 opacity-50" />
		</InputGroup.Addon>
	</InputGroup.Root>
	<div class="chips">
		{#each FILTERS as f (f.id)}
			<Button
				variant={on.has(f.id) ? 'default' : 'outline'}
				size="sm"
				onclick={() => toggle(f.id)}
			>
				{f.label}
			</Button>
		{/each}
	</div>
</div>

<div class="grid">
	{#each shown as r (r.gmId)}
		{@const p = g.byId.get(r.gmId)}
		{@const gone = g.dead(r.gmId)}
		{@const mark = g.me ? g.target(g.me) === r.gmId : false}
		{@const face = r.photos[0] ?? r.avatar}
		<a class="card" class:gone class:me={g.me === r.gmId} class:mark href="/player/{r.gmId}">
			{#if face}
				<Photo shot={face} class="shot" dead={gone} />
			{:else}
				<div class="shot none">{r.name[0]}</div>
			{/if}

			<div class="tags">
				{#if gone}<Badge variant="destructive">out</Badge>{/if}
				{#if g.me === r.gmId}<Badge variant="secondary">you</Badge>{/if}
				{#if mark}<Badge variant="destructive">your target</Badge>{/if}
				{#if !r.matched}<Badge variant="outline" class="unknown">unidentified</Badge>{/if}
			</div>

			<div class="caption">
				<div class="nm">{r.name}</div>
				<div class="sub">
					{[CLASS[r.class ?? ''], p?.majors?.[0]?.score ? p.majors[0].major : null]
						.filter(Boolean)
						.join(' · ')}
				</div>
				{#if p}
					<div class="loc">{[p.dorm, p.room].filter(Boolean).join(' ') || 'unknown'}</div>
				{/if}
				{#if gone}
					<div class="hunt">
						killed by {g.chain.kills[r.gmId] ? g.name(g.chain.kills[r.gmId]) : 'someone'}
					</div>
				{:else if mark}
					<div class="hunt">your target</div>
				{:else if g.seesRing && g.target(r.gmId)}
					<div class="hunt">hunting {g.name(g.target(r.gmId))}</div>
				{/if}
				{#if p && !gone && g.next(p)}
					<div class="loc">next: {g.next(p)}</div>
				{/if}
			</div>
		</a>
	{:else}
		<p class="empty">Nobody matches that.</p>
	{/each}
</div>

{#if q || on.size}
	<p class="legal count">{shown.length} of {g.roster.length}</p>
{/if}

<style>
	.controls {
		display: flex;
		flex-wrap: wrap;
		gap: 12px;
		align-items: center;
		margin-bottom: 18px;
	}
	.controls :global(.search) {
		flex: 1 1 260px;
		max-width: 420px;
	}
	.count {
		margin-top: 14px;
	}

	.grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(190px, 1fr));
		gap: 12px;
	}

	.card {
		display: block;
		position: relative;
		background: var(--color-panel);
		border: 1px solid var(--color-line);
		border-radius: 3px;
		overflow: hidden;
		cursor: pointer;
		text-align: left;
		color: inherit;
		font: inherit;
		padding: 0;
		transition: border-color 0.12s;
	}
	.card:hover {
		border-color: var(--color-faint);
	}
	.card.gone {
		opacity: 0.42;
	}
	.card.gone :global(.shot) {
		filter: grayscale(1);
	}
	.card.mark {
		border-color: var(--color-blood);
		box-shadow: inset 0 0 0 1px var(--color-blood);
	}
	.card.me {
		border-color: var(--color-live);
	}

	.card :global(.shot) {
		width: 100%;
		aspect-ratio: 3 / 4;
	}
	.shot.none {
		display: grid;
		place-items: center;
		aspect-ratio: 3 / 4;
		background: oklch(24% 0.01 60);
		color: var(--color-faint);
		font-size: 30px;
		font-family: var(--font-serif);
	}

	.tags {
		position: absolute;
		top: 8px;
		left: 8px;
		display: flex;
		gap: 4px;
	}
	.tags :global(> *) {
		backdrop-filter: blur(4px);
		font-size: 9px;
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}
	.tags :global(.unknown) {
		color: var(--color-warn);
		border-color: oklch(50% 0.09 85);
	}

	.caption {
		padding: 9px 11px 11px;
	}
	.nm {
		font: 400 18px/1.15 var(--font-serif);
	}
	.sub {
		color: var(--color-dim);
		font-size: 11px;
		margin-top: 3px;
	}
	.loc {
		color: var(--color-faint);
		font-size: 11px;
	}
	.hunt {
		color: var(--color-blood);
		font-size: 11px;
		margin-top: 3px;
	}
	.card.gone .hunt {
		color: var(--color-faint);
	}
</style>
