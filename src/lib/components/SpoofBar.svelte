<script lang="ts">
	// You are wearing somebody else's session. Impossible to miss, impossible to
	// forget, and the only place writing gets switched on.
	import { page } from '$app/state';
	import { Button } from '$lib/components/ui/button';

	let {
		as,
		writing
	}: { as: string; writing: boolean } = $props();
</script>

<div class="spoof" class:armed={writing}>
	<span>
		Viewing as <strong>{as}</strong> —
		{#if writing}
			<strong class="hot">anything you do is theirs</strong>
		{:else}
			looking only
		{/if}
	</span>

	<div class="controls">
		<form method="POST" action="/admin/spoof">
			<input type="hidden" name="back" value={page.url.pathname} />
			<input type="hidden" name="write" value={writing ? '0' : '1'} />
			<Button size="sm" variant={writing ? 'default' : 'outline'} type="submit">
				{writing ? 'Stop writing' : 'Let me write as them'}
			</Button>
		</form>
		<form method="POST" action="/admin/spoof">
			<input type="hidden" name="back" value="/admin" />
			<input type="hidden" name="userId" value="" />
			<Button size="sm" variant="outline" type="submit">Back to me</Button>
		</form>
	</div>
</div>

<style>
	.spoof {
		position: sticky;
		top: 0;
		z-index: 20;
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 12px;
		padding: 8px 22px;
		font-size: 12px;
		color: var(--color-warn);
		background: color-mix(in oklch, var(--color-warn) 12%, var(--color-bg));
		border-bottom: 1px solid color-mix(in oklch, var(--color-warn) 40%, transparent);
	}
	/* Armed to write is a different animal, and looks like one. */
	.spoof.armed {
		color: var(--color-blood);
		background: color-mix(in oklch, var(--color-blood) 16%, var(--color-bg));
		border-bottom-color: var(--color-blood);
	}
	strong {
		font-weight: 400;
		color: var(--color-ink);
	}
	strong.hot {
		color: var(--color-blood);
	}
	.controls {
		margin-left: auto;
		display: flex;
		gap: 6px;
	}
</style>
