<script lang="ts">
	// The secret behind the wordmark. Give it a student id and it drops you onto
	// that person's file with everything an admin would see drawn in — the map,
	// the timetable, the lot. It resolves the id to a player and hands off to the
	// page keyed by their gm id, carrying the id along as the key that unlocks it.
	import { goto } from '$app/navigation';

	let { onclose }: { onclose: () => void } = $props();

	let id = $state('');
	let busy = $state(false);
	let missed = $state(false);
	let field: HTMLInputElement | undefined = $state();

	$effect(() => field?.focus());

	async function look() {
		const q = id.trim();
		if (!q || busy) return;
		busy = true;
		missed = false;
		try {
			const r = await fetch('/api/xray', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ id: q })
			});
			const data = (await r.json()) as { found: boolean; gmId?: string };
			if (data.found && data.gmId) {
				onclose();
				await goto(`/player/${data.gmId}?id=${encodeURIComponent(q)}`);
			} else {
				missed = true;
			}
		} finally {
			busy = false;
		}
	}
</script>

<svelte:window onkeydown={(e) => e.key === 'Escape' && onclose()} />

<!-- svelte-ignore a11y_click_events_have_key_events -->
<div class="scrim" onclick={onclose} role="presentation">
	<div
		class="panel"
		onclick={(e) => e.stopPropagation()}
		role="dialog"
		aria-modal="true"
		aria-label="x-ray"
		tabindex="-1"
	>
		<button class="x" onclick={onclose} aria-label="close">✕</button>
		<h2>X-RAY</h2>
		<p class="sub">Show me allllll the data; but first give me the id of the person to look up.</p>

		<form
			onsubmit={(e) => {
				e.preventDefault();
				look();
			}}
		>
			<input
				bind:this={field}
				bind:value={id}
				inputmode="numeric"
				autocomplete="off"
				placeholder="student id"
				oninput={() => (missed = false)}
			/>
			<button type="submit" disabled={busy || !id.trim()}>{busy ? '…' : 'open'}</button>
		</form>

		{#if missed}
			<p class="miss">Nobody by that id.</p>
		{/if}
	</div>
</div>

<style>
	.scrim {
		position: fixed;
		inset: 0;
		z-index: 50;
		background: oklch(8% 0.01 60 / 0.72);
		display: grid;
		place-items: start center;
		padding: 12vh 16px 16px;
		backdrop-filter: blur(2px);
	}
	.panel {
		position: relative;
		width: min(440px, 100%);
		background: var(--color-panel);
		border: 1px solid var(--color-line);
		border-radius: 4px;
		padding: 20px 20px 22px;
		box-shadow: 0 24px 60px oklch(0% 0 0 / 0.5);
	}
	.x {
		position: absolute;
		top: 10px;
		right: 12px;
		background: none;
		border: 0;
		color: var(--color-dim);
		font: inherit;
		cursor: pointer;
	}
	.x:hover {
		color: var(--color-blood);
	}
	h2 {
		margin: 0;
		font-family: var(--font-mono);
		font-weight: 700;
		letter-spacing: 0.35em;
		font-size: 15px;
		color: var(--color-blood);
	}
	.sub {
		margin: 3px 0 14px;
		font-size: 13px;
		color: var(--color-dim);
	}
	form {
		display: flex;
		gap: 8px;
	}
	input {
		flex: 1;
		background: var(--color-bg);
		border: 1px solid var(--color-line);
		border-radius: 3px;
		padding: 8px 10px;
		color: var(--color-ink);
		font-family: var(--font-mono);
		font-size: 15px;
		letter-spacing: 0.08em;
	}
	input:focus {
		outline: none;
		border-color: var(--color-blood);
	}
	form button {
		background: var(--color-blood);
		border: 0;
		border-radius: 3px;
		padding: 0 16px;
		color: var(--color-bg);
		font-family: var(--font-mono);
		font-weight: 600;
		cursor: pointer;
	}
	form button:disabled {
		opacity: 0.5;
		cursor: default;
	}
	.miss {
		margin-top: 14px;
		color: var(--color-dim);
		font-style: italic;
		font-size: 13px;
	}
</style>
