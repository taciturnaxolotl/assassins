<script lang="ts">
	// A photo in a fixed box, turned upright if it came off a phone sideways.
	// The image is laid out at the box's swapped dimensions and then rotated in,
	// so a sideways shot crops the way an upright one would.
	import type { Shot } from '$lib/game/types';

	let {
		shot,
		class: klass = '',
		dead = false
	}: { shot: Shot; class?: string; dead?: boolean } = $props();
</script>

<div class="shotbox {klass}" class:dead>
	<img src={shot.url} loading="lazy" alt="" class={shot.rotate ? `rot${shot.rotate}` : ''} />
	{#if dead}
		<!-- Drawn rather than an emoji: it has to sit at one weight and one colour
		     whatever the reader's font stack does, and it has to read at forty
		     pixels in a roster grid. -->
		<svg class="skull" viewBox="0 0 24 24" aria-label="eliminated" role="img">
			<g fill="currentColor">
				<path
					d="M12 2C7.3 2 3.6 5.4 3.6 9.9c0 2.6 1.3 4.6 3 5.9.4.3.6.7.6 1.2v1.3c0 .8.7 1.5 1.5 1.5h.6v-1.6c0-.4.3-.7.7-.7s.7.3.7.7V19.8h2.6v-1.6c0-.4.3-.7.7-.7s.7.3.7.7V19.8h.6c.8 0 1.5-.7 1.5-1.5V17c0-.5.2-.9.6-1.2 1.7-1.3 3-3.3 3-5.9C20.4 5.4 16.7 2 12 2Z"
				/>
			</g>
			<ellipse cx="8.7" cy="10.2" rx="2.4" ry="2.8" fill="var(--skull-hollow, #000)" />
			<ellipse cx="15.3" cy="10.2" rx="2.4" ry="2.8" fill="var(--skull-hollow, #000)" />
			<path d="M12 13.2l-1.1 2.2h2.2Z" fill="var(--skull-hollow, #000)" />
		</svg>
	{/if}
</div>

<style>
	.shotbox {
		position: relative;
		overflow: hidden;
		container-type: size;
		background: oklch(24% 0.01 60);
	}

	/* Out of the game: the colour goes, and a skull sits over the face so the
	   state reads at a glance in a grid rather than needing a caption. */
	.shotbox.dead img {
		filter: grayscale(1) brightness(0.55) contrast(0.9);
	}
	.skull {
		position: absolute;
		top: 50%;
		left: 50%;
		width: 42cqmin;
		height: 42cqmin;
		transform: translate(-50%, -50%);
		color: oklch(88% 0.01 80);
		--skull-hollow: oklch(18% 0.01 60);
		filter: drop-shadow(0 1px 3px oklch(0% 0 0 / 0.6));
		pointer-events: none;
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
