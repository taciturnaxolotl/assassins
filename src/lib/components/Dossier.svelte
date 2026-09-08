<script lang="ts">
	// Everything known about one person. `wide` lays it out for a full page; the
	// drawer gets the same content in a column. One component, used both places,
	// so every player gets the same page no matter where you clicked them.

	import Photo from './Photo.svelte';
	import Who from './Who.svelte';
	import CampusMap from './CampusMap.svelte';
	import Itinerary from './Itinerary.svelte';
	import WeekGrid from './WeekGrid.svelte';
	import PlayerPicker from './PlayerPicker.svelte';
	import { Button } from '$lib/components/ui/button';
	import { Textarea } from '$lib/components/ui/textarea';
	import * as Alert from '$lib/components/ui/alert';
	import { game } from '$lib/game/store.svelte';
	import { CLASS, DAYS, WEEK, dayOf, place } from '$lib/game/time';
	import type { Player } from '$lib/game/types';

	let {
		player,
		wide = false,
		preview = null
	}: {
		player: Player;
		wide?: boolean;
		/**
		 * Show the real layout with invented contents behind frosted glass. The
		 * name and the first photograph are real; everything under them is not,
		 * and is not this person's. `why` is what it takes to see the real thing.
		 */
		preview?: { why: string; buy?: boolean } | null;
	} = $props();

	const g = game();
	// Today, unless they have nothing today — a dossier that opens on a blank
	// Saturday is a worse first look than one that opens on a day they move.
	const busiest = () => {
		const today = new Date().getDay();
		if (dayOf(g.slots, player, today).length) return today;
		return WEEK.find((d) => dayOf(g.slots, player, d).length) ?? today;
	};
	let day = $state(busiest());
	let err = $state('');
	let busy = $state(false);

	// Three sources, and it matters which is which: the photo they posted is
	// how they look now and chose to be seen, the profile picture is whatever
	// they picked months ago, and the directory shot is a year old and official.
	const shots = $derived(
		[
			...player.photos.map((s) => ({ shot: s, from: 'posted' })),
			...(player.avatar ? [{ shot: player.avatar, from: 'profile' }] : []),
			...(player.gallery ?? []).map((s) => ({ shot: s, from: 'gallery' })),
			...(player.directoryPhoto ? [{ shot: player.directoryPhoto, from: 'directory' }] : [])
		]
	);
	const isMe = $derived(player.gmId === g.me);
	const canRoute = $derived(!!g.walker && g.walker.plan(g.slots, player, day).located.length > 0);

	// Only set once the ring has routed around somebody: their live target is
	// no longer the one they drew.
	const inherited = $derived.by(() => {
		if (!g.seesRing) return null;
		const live = g.target(player.gmId);
		return live && live !== g.chain.assigned[player.gmId] ? live : null;
	});

	const vitals = $derived(
		[
			['Class', CLASS[player.class ?? ''] ?? null],
			['Lives', [player.dorm, player.room].filter(Boolean).join(' ') || null],
			['Hometown', player.hometown ?? null],
			[
				'Major',
				(player.majors ?? [])
					.filter((m) => m.score > 0)
					.map((m) => `${m.major} ${m.score}%`)
					.join(' · ') || null
			],
			['Next class', g.dead(player.gmId) ? null : g.next(player)],
			['Student id', player.id ?? null]
		].filter(([, v]) => v) as [string, string][]
	);

	async function run(fn: () => Promise<unknown>) {
		err = '';
		busy = true;
		try {
			await fn();
		} catch (e) {
			err = (e as Error).message;
		} finally {
			busy = false;
		}
	}
</script>

<div class="dossier" class:wide>
	<div class="head">
		{#if shots.length}
			<div class="reel">
				{#each preview ? shots.slice(0, 1) : shots as s, i (i)}
					<figure class="frame">
						<Photo shot={s.shot} class="still" />
						<figcaption>{s.from}</figcaption>
					</figure>
				{/each}
			</div>
		{/if}

		<div class="id">
			<h2>{player.name}</h2>
			{#if player.legalName && player.legalName !== player.name}
				<div class="legal">{player.legalName}</div>
			{/if}

			{#if preview}
				<p class="legal sealed">{preview.why}</p>
				{#if preview.buy}
					<form method="POST" action="/api/billing/checkout" class="buy">
						<Button type="submit" size="lg">Unlock the fancy tools</Button>
					</form>
				{/if}
			{:else if !g.me}
				<p class="legal">Once your claim is approved you can work the chain from here.</p>
			{:else if isMe}
				<p class="legal">This is you.</p>
			{:else}
				<div class="actions">
					{#if g.claimedKill === player.gmId}
						<Button variant="outline" size="sm" disabled={busy} onclick={() => run(() => g.revive(player.gmId))}>
							Reported — take it back
						</Button>
					{:else}
						<Button
							variant={g.dead(player.gmId) ? 'default' : 'outline'}
							size="sm"
							disabled={busy || g.dead(player.gmId)}
							onclick={() => run(() => g.kill(player.gmId, g.me!))}
						>
							{g.dead(player.gmId) ? 'Confirmed ✓' : 'I got them'}
						</Button>
					{/if}
				</div>
				{#if g.claimedKill === player.gmId}
					<p class="legal">
						Waiting on somebody to confirm it. You keep hunting them until they
						do.
					</p>
				{/if}
			{/if}
			{#if err}
				<Alert.Root variant="destructive" class="mt-3">
					<Alert.Description>{err}</Alert.Description>
				</Alert.Root>
			{/if}

			<dl class="vitals" class:frosted={preview}>
				{#each vitals as [k, v] (k)}
					<dt>{k}</dt>
					<dd>{v}</dd>
				{/each}

				<!-- Assigned, killed by, hunting, hunted by: these four are the ring,
				     which is the game's one secret. Only whoever runs it sees them. -->
				{#if g.isAdmin}
					<dt>Assigned</dt>
					<dd>
						<PlayerPicker
							value={g.chain.assigned[player.gmId] ?? ''}
							placeholder="— not known —"
							onpick={(v) => run(() => g.assign(player.gmId, v || null))}
						/>
					</dd>

					<dt>Killed by</dt>
					<dd>
						<PlayerPicker
							value={g.dead(player.gmId) ? g.chain.kills[player.gmId] || '?' : ''}
							placeholder="— still alive —"
							unknown="eliminated, killer unknown"
							onpick={(v) =>
								run(() =>
									v === '' ? g.revive(player.gmId) : g.kill(player.gmId, v === '?' ? null : v)
								)}
						/>
					</dd>
				{/if}

				{#if g.seesRing}
					<!-- Assigned is the edge they reported; this is that edge walked
					     forward past whoever has died since. They agree until an
					     inheritance happens, so it only earns a row when they differ
					     — which is exactly when it is worth reading. -->
					{#if inherited}
						<dt>Inherited</dt>
						<dd><Who id={inherited} /></dd>
					{/if}

					<dt>Hunted by</dt>
					<dd>
						{#each g.hunters(player.gmId) as h, i (h.gmId)}
							{#if i}<span class="faint">, </span>{/if}<Who id={h.gmId} />
						{:else}
							<span class="faint">nobody known</span>
						{/each}
					</dd>
				{/if}

				{#if g.scalps(player.gmId).length}
					<dt>Kills</dt>
					<dd>
						{#each g.scalps(player.gmId) as v, i (v)}
							{#if i}<span class="faint">, </span>{/if}<Who id={v} />
						{/each}
					</dd>
				{/if}
			</dl>
		</div>
	</div>

	<div class:frosted={preview}>
	{#if canRoute}
		<div class="block">
			<h3 class="rule">Route — {DAYS[day]}</h3>
			<div class="mapwrap">
				<CampusMap people={[player]} {day} onday={(d) => (day = d)} compact={!wide} />
				<Itinerary {player} {day} />
			</div>
		</div>
	{/if}

	{#if player.schedule?.length}
		<div class="block">
			<h3 class="rule">Week</h3>
			<WeekGrid {player} px={wide ? 1.1 : 0.8} />
		</div>
	{/if}

	{#if !player.matched && player.candidates?.length}
		<div class="block">
			<h3 class="rule">Who is this? {player.candidates.length} candidates</h3>
			<div class="pick">
				{#each player.candidates as c (c.id)}
					<div><code>{c.id}</code> {c.name} · {c.class} · {c.dorm || 'off campus'}</div>
				{/each}
			</div>
			<p class="legal">Add the winner to data/overrides.tsv and rebuild.</p>
		</div>
	{/if}

	{#if player.schedule?.length}
		<div class="block">
			<h3 class="rule">{g.term} sections — {player.schedule.length}</h3>
			{#each player.schedule as c (c.section)}
				<div class="course">
					<div class="hd">
						<span class="code">{c.section}</span>
						<span class="ttl">{c.instructor ?? ''}</span>
					</div>
					<div class="ttl">{c.title ?? 'unlisted section'}</div>
					{#each c.meets ?? [] as m, i (i)}
						<div>
							<span class="when">
								{m.days.map((d) => DAYS[d]).join(' ')}
								{m.start ?? ''}{m.start ? '–' : ''}{m.end ?? ''}
							</span>
							<span class="where">{place(m)}</span>
						</div>
					{/each}
				</div>
			{/each}
		</div>
	{/if}

		{#if !preview}
			<div class="block">
				<h3 class="rule">Notes</h3>
				<Textarea
					autocomplete="off"
					placeholder="habits, sightings, who they hang with…"
					value={g.notes[player.gmId] ?? ''}
					oninput={(e) => g.note(player.gmId, e.currentTarget.value)}
				/>
			</div>
		{/if}
	</div>
</div>

<style>
	h2 {
		font: 400 32px/1.05 var(--font-serif);
	}
	.head {
		margin-bottom: 8px;
	}
	.dossier.wide .head {
		display: grid;
		grid-template-columns: minmax(0, 1fr) minmax(300px, 420px);
		gap: 26px;
		align-items: start;
	}
	.reel {
		display: flex;
		gap: 8px;
		overflow-x: auto;
		margin: 16px 0;
		padding-bottom: 4px;
	}
	.frame {
		flex: 0 0 auto;
		margin: 0;
	}
	.reel :global(.still) {
		height: 220px;
		aspect-ratio: 3 / 4;
		border-radius: 2px;
		border: 1px solid var(--color-line);
	}
	.frame figcaption {
		margin-top: 4px;
		font-size: 9px;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: var(--color-faint);
	}
	.dossier.wide .reel {
		margin-top: 0;
	}
	.dossier.wide .reel :global(.still) {
		height: 300px;
	}

	.actions {
		display: flex;
		gap: 6px;
		margin: 16px 0 4px;
	}
	.actions :global(button) {
		flex: 1;
	}

	dl.vitals {
		display: grid;
		grid-template-columns: 92px 1fr;
		gap: 5px 12px;
		margin: 16px 0;
		align-items: baseline;
	}
	dl.vitals dt {
		color: var(--color-faint);
		font-size: 11px;
		letter-spacing: 0.06em;
		text-transform: uppercase;
	}

	.mapwrap {
		display: grid;
		gap: 20px;
		align-items: start;
	}
	.dossier.wide .mapwrap {
		grid-template-columns: minmax(280px, 44%) minmax(300px, 1fr);
	}

	.course {
		padding: 8px 0;
		border-bottom: 1px solid color-mix(in oklch, var(--color-line) 60%, transparent);
	}
	.course .hd {
		display: flex;
		justify-content: space-between;
		gap: 10px;
	}
	.course .code {
		color: var(--color-blood);
	}
	.course .ttl {
		color: var(--color-dim);
		font-size: 11px;
	}
	.course .when {
		color: var(--color-ink);
		font-size: 11px;
		font-variant-numeric: tabular-nums;
	}
	.course .where {
		color: var(--color-faint);
		font-size: 11px;
	}

	.pick {
		display: grid;
		gap: 4px;
	}
	.pick code {
		color: var(--color-dim);
	}
</style>
