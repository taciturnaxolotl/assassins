<script lang="ts">
	import { enhance } from '$app/forms';
	import { Button } from '$lib/components/ui/button';
	import * as Alert from '$lib/components/ui/alert';
	import PlayerCombobox from '$lib/components/PlayerCombobox.svelte';

	let { data, form } = $props();

	// The directory resolves the account's own address to a student, so for
	// almost everyone this is a confirmation rather than a question. When it is
	// certain the server sends no roster at all, so there is nothing on this
	// page that could offer somebody else's name.
	const certain = $derived(data.certain);

	let picked = $state('');
	let busy = $state(false);
	// Somebody the directory placed on the roster is in the ring, and cannot
	// declare themselves outside it.

	const chosen = $derived(certain ? certain.gmId : picked);
	const ready = $derived(!!certain || !!picked);
	const options = $derived(
		data.roster.map((p) => ({ ...p, taken: data.taken.includes(p.gmId) }))
	);
</script>

<svelte:head><title>Welcome · Assassins</title></svelte:head>

<main>
	<form
		method="POST"
		use:enhance={() => {
			busy = true;
			return async ({ result, update }) => {
				// A success redirects, so the button stays dead until the page
				// actually changes. Handing it back first makes it flick from
				// pressed to clickable and then navigate, which reads as a misfire.
				if (result.type !== 'redirect') busy = false;
				await update();
			};
		}}
	>
		<h1>Welcome {certain?.name ?? data.displayName}</h1>

		{#if certain}
			<p>
				Your mission, should you choose to accept it, is to assassinate multiple
				high value targets which shall be provided shortly.
			</p>
		{:else}
			<p>Your agent ID is currently unmatched. Please select your identity:</p>
			<PlayerCombobox {options} bind:value={picked} placeholder="Select your identity" />
		{/if}

		<input type="hidden" name="gmId" value={chosen} />
		<input type="hidden" name="kind" value="player" />

		{#if form?.message}
			<Alert.Root variant="destructive">
				<Alert.Description>{form.message}</Alert.Description>
			</Alert.Root>
		{/if}

		<Button type="submit" size="lg" disabled={!ready || busy}>
			{busy ? 'confirming…' : 'Please confirm this is you.'}
		</Button>
	</form>
</main>

<style>
	/* The briefing is one thought, so it gets the middle of the screen. */
	main {
		display: grid;
		place-items: center;
		min-height: 100dvh;
		padding: 24px;
		text-align: center;
	}
	form {
		display: grid;
		gap: 20px;
		justify-items: center;
		width: min(44ch, 100%);
	}
	form > :global(*) {
		width: 100%;
	}
	form > :global(button[type='submit']) {
		width: auto;
	}

	h1 {
		font: 400 clamp(32px, 6vw, 44px) / 1.12 var(--font-serif);
		margin: 0;
	}
	p {
		color: var(--color-dim);
		line-height: 1.7;
		font-size: 15px;
		margin: 0;
	}
</style>
