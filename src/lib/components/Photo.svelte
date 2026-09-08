<script lang="ts">
	// A photo in a fixed box, turned upright if it came off a phone sideways.
	// The image is laid out at the box's swapped dimensions and then rotated in,
	// so a sideways shot crops the way an upright one would.
	import type { Shot } from '$lib/game/types';

	let { shot, class: klass = '' }: { shot: Shot; class?: string } = $props();
</script>

<div class="shotbox {klass}">
	<img src={shot.url} loading="lazy" alt="" class={shot.rotate ? `rot${shot.rotate}` : ''} />
</div>

<style>
	.shotbox {
		position: relative;
		overflow: hidden;
		container-type: size;
		background: oklch(24% 0.01 60);
	}
	img {
		position: absolute;
		top: 0;
		left: 0;
		display: block;
		width: 100%;
		height: 100%;
		object-fit: cover;
	}
	img.rot90 {
		width: 100cqh;
		height: 100cqw;
		transform-origin: top left;
		transform: rotate(90deg) translateY(-100%);
	}
	img.rot270 {
		width: 100cqh;
		height: 100cqw;
		transform-origin: top left;
		transform: rotate(-90deg) translateX(-100%);
	}
	img.rot180 {
		transform: rotate(180deg);
	}
</style>
