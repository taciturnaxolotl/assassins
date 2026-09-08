<script lang="ts">
	// The secret behind the wordmark. Type a student id, get that person's
	// timetable back. Nothing here decides who may look — the server does — but
	// it is only ever mounted once the wordmark has been tapped enough to ask
	// for it, so finding it is the first half of the puzzle.
	import { DAYS, place } from '$lib/game/time';
	import type { Course } from '$lib/game/types';

	let { onclose }: { onclose: () => void } = $props();

	let id = $state('');
	let busy = $state(false);
	let asked = $state(false);
	let found = $state<{ name: string; term: string; schedule: Course[] } | null>(null);
	let field: HTMLInputElement | undefined = $state();

	$effect(() => field?.focus());

	async function look() {
		const q = id.trim();
		if (!q || busy) return;
		busy = true;
		try {
			const r = await fetch('/api/xray', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ id: q })
			});
			const data = (await r.json()) as typeof found & { found: boolean };
			found = data.found ? data : null;
			asked = true;
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
				oninput={() => (asked = false)}
			/>
			<button type="submit" disabled={busy || !id.trim()}>{busy ? '…' : 'pull'}</button>
		</form>

		{#if found}
			<div class="out">
				<div class="who">{found.name} · {found.term}</div>
				{#each found.schedule as c (c.section)}
					<div class="course">
						<div class="code">{c.section}<span>{c.title ?? ''}</span></div>
						{#each c.meets ?? [] as m, i (i)}
							<div class="meet">
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
		{:else if asked}
			<p class="miss">Nothing on file for that id.</p>
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
		max-height: 76vh;
		overflow: auto;
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
	.out {
		margin-top: 16px;
		border-top: 1px solid var(--color-line);
		padding-top: 12px;
	}
	.who {
		font-family: var(--font-serif);
		font-size: 21px;
		margin-bottom: 10px;
	}
	.course {
		border-left: 2px solid var(--color-line);
		padding-left: 10px;
		margin-bottom: 10px;
	}
	.code {
		font-family: var(--font-mono);
		font-weight: 600;
		font-size: 13px;
	}
	.code span {
		color: var(--color-dim);
		font-weight: 400;
		margin-left: 8px;
	}
	.meet {
		display: flex;
		justify-content: space-between;
		gap: 12px;
		font-size: 13px;
		color: var(--color-dim);
		line-height: 1.6;
	}
	.meet .when {
		font-family: var(--font-mono);
		white-space: nowrap;
	}
	.miss {
		margin-top: 14px;
		color: var(--color-dim);
		font-style: italic;
		font-size: 13px;
	}
</style>
