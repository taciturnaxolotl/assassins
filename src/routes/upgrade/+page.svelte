<script lang="ts">
	import { Button, buttonVariants } from '$lib/components/ui/button';
	import * as Table from '$lib/components/ui/table';
	let { data } = $props();
	let busy = $state(false);
</script>

<svelte:head><title>Unlock · Assassins</title></svelte:head>

<header>
	<a href="/target">← back</a>
</header>

<main>
	{#if data.already}
		<h1>Already unlocked</h1>
		<p>Nothing to do here.</p>
		<form method="POST" action="/api/billing/portal">
			<Button variant="outline" type="submit">Manage billing</Button>
		</form>
	{:else}
		<h1>Unlock the dossiers</h1>

		<p>
			Reporting your draw and your kills is free and stays that way — the ring
			only works if everyone is in it. Reading the files costs.
		</p>

		<Table.Root>
			<Table.Header>
				<Table.Row><Table.Head>Free</Table.Head><Table.Head>Unlocked</Table.Head></Table.Row>
			</Table.Header>
			<Table.Body>
				{#each [['Report your draw and your kills', 'Same'], ['Names and faces', 'Every photo, hall and room, hometown, major'], ['—', 'Every section, when it meets, which room'], ['—', 'The route across campus and the slack between classes'], ['—', 'The roster, searchable down to a course code'], ['—', 'The ring as it stands and what each kill inherited']] as [free, paid] (paid)}
					<Table.Row>
						<Table.Cell class="text-[var(--color-faint)] w-[45%]">{free}</Table.Cell>
						<Table.Cell>{paid}</Table.Cell>
					</Table.Row>
				{/each}
			</Table.Body>
		</Table.Root>

		{#if data.pitch}
			<p class="legal">
				For {data.pitch.name} specifically that is {data.pitch.shots} photos,
				{data.pitch.sections} sections and {data.pitch.meetings} meetings a week.
			</p>
		{/if}

		<form method="POST" action="/api/billing/checkout" onsubmit={() => (busy = true)}>
			<Button type="submit" disabled={busy}>
				{busy ? 'opening checkout…' : 'Continue to checkout'}
			</Button>
		</form>
	{/if}
</main>

<style>
	header {
		padding: 14px 22px;
		border-bottom: 1px solid var(--color-line);
	}
	header a {
		font-size: 11px;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--color-faint);
	}
	header a:hover {
		color: var(--color-blood);
	}

	main {
		max-width: 640px;
		padding: 30px 22px 60px;
	}
	h1 {
		font: 400 32px/1.05 var(--font-serif);
	}
	p {
		color: var(--color-dim);
		line-height: 1.65;
		margin: 12px 0 24px;
		max-width: 52ch;
	}
	main :global(table) {
		margin-bottom: 20px;
	}
	.legal {
		margin-bottom: 22px;
	}

</style>
