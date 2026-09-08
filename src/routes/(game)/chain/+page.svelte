<script lang="ts">
	import Who from '$lib/components/Who.svelte';
	import { game } from '$lib/game/store.svelte';

	const g = game();

	const known = $derived(Object.keys(g.chain.assigned).length);
	const graves = $derived(Object.keys(g.chain.kills));
	const runs = $derived(g.runs());
	const orphans = $derived(
		g.roster.filter((r) => !g.dead(r.gmId) && !(r.gmId in g.chain.assigned))
	);
</script>

<svelte:head><title>Chain · Assassins</title></svelte:head>

<div class="block">
	<h3 class="rule">
		The ring — {known} of {g.roster.length} draws reported, {graves.length} down
	</h3>
	{#if !runs.length}
		<p class="empty">Nobody has said who they drew yet.</p>
	{:else}
		<div class="runs">
			{#each runs as run, i (i)}
				<div class="run">
					{#each run as id, j (j)}
						{#if j}<span class="arrow">→</span>{/if}
						{#if id === null}
							<span class="faint">↺ closes</span>
						{:else}
							<Who {id} />
						{/if}
					{/each}
				</div>
			{/each}
		</div>
	{/if}
	<p class="legal">
		Each player reports their own draw, so the ring assembles itself. A run that
		bites its own tail is the whole thing.
	</p>
</div>

{#if graves.length}
	<div class="block">
		<h3 class="rule">Kill log</h3>
		<table class="sheet">
			<thead>
				<tr><th>Killer</th><th>Victim</th><th>Inherited</th></tr>
			</thead>
			<tbody>
				{#each graves as v (v)}
					<tr>
						<td>
							{#if g.chain.kills[v]}
								<Who id={g.chain.kills[v]} />
							{:else}
								<span class="faint">unknown</span>
							{/if}
						</td>
						<td><Who id={v} /></td>
						<td>
							{#if g.chain.kills[v] && g.target(g.chain.kills[v])}
								<Who id={g.target(g.chain.kills[v])} />
							{:else}
								<span class="faint">—</span>
							{/if}
						</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
{/if}

<div class="block">
	<h3 class="rule">Still quiet — {orphans.length}</h3>
	{#if !orphans.length}
		<p class="empty">Everyone living has reported a draw.</p>
	{:else}
		<p class="legal">
			Alive, and has not said who they drew. Every one of these is a gap in the
			ring above.
		</p>
		<div class="quiet">
			{#each orphans as r (r.gmId)}
				<Who id={r.gmId} />
			{/each}
		</div>
	{/if}
</div>

<style>
	.runs {
		display: grid;
		gap: 10px;
	}
	.run {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: 7px;
		padding: 9px 12px;
		background: var(--color-panel);
		border: 1px solid var(--color-line);
		border-radius: 3px;
	}
	.arrow {
		color: var(--color-blood);
	}
	.quiet {
		display: flex;
		flex-wrap: wrap;
		gap: 4px 14px;
		margin-top: 10px;
	}
</style>
