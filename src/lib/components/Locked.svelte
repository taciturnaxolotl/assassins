<script lang="ts">
	// The fallback when there is no sample to draw — no campus, or a mark the
	// build never resolved. Everything on it is true and about them; it just
	// cannot show the shape of the file the way the frosted dossier does.
	import { Button } from '$lib/components/ui/button';
	import * as Table from '$lib/components/ui/table';
	import type { Teaser } from '$lib/server/data';

	let { name, teaser }: { name: string; teaser?: Teaser | null } = $props();

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
				</Table.Body>
			</Table.Root>
		</div>
	{/if}

	<form method="POST" action="/api/billing/checkout">
		<Button type="submit" size="lg">Unlock the fancy tools</Button>
	</form>
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
</style>
