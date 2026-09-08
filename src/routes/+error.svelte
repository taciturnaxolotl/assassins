<script lang="ts">
	import { page } from '$app/state';
	import { buttonVariants } from '$lib/components/ui/button';
</script>

<main>
	<h1>{page.status}</h1>
	<p>{page.error?.message ?? 'Something broke.'}</p>
	<a class={buttonVariants({ variant: 'outline' })} href="/">Back to the start</a>
</main>

<style>
	main {
		max-width: 460px;
		margin: 0 auto;
		padding: 12vh 22px;
	}
	h1 {
		font: 400 42px/1 var(--font-serif);
		color: var(--color-blood);
	}
	p {
		color: var(--color-dim);
		line-height: 1.65;
		margin: 8px 0 24px;
	}
</style>
