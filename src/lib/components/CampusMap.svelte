<script lang="ts">
	// One drawing of the campus. Pass one player to trace their day; pass a
	// crowd and it draws how heavily each path is used instead.
	//
	// Everything stays in metres and only the viewBox moves, so a route is the
	// same numbers whether you are looking at the whole village or one courtyard.

	import { game } from '$lib/game/store.svelte';
	import { Button } from '$lib/components/ui/button';
	import { DAYS, WEEK, hhmm } from '$lib/game/time';
	import type { Player } from '$lib/game/types';
	import type { Plan } from '$lib/game/route';

	let {
		people,
		day,
		onday,
		compact = false,
		marks = []
	}: {
		people: Player[];
		day: number;
		onday?: (d: number) => void;
		compact?: boolean;
		/** Places worth standing, drawn over the route rather than in it. */
		marks?: { x: number; y: number; label: string }[];
	} = $props();

	const g = game();
	const M = $derived(g.campus!);
	const home = $derived.by(() => {
		const [x0, y0, x1, y1] = M.box;
		return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
	});

	const crowd = $derived(people.length > 1);
	const plans = $derived(
		people
			.map((p) => ({ p, plan: g.walker!.plan(g.slots, p, day) }))
			.filter((r) => r.plan.located.length)
	);

	// Three thousand <line> elements with a non-scaling stroke will pin a
	// renderer to the floor. One <path> of three thousand subpaths will not.
	const segments = (edges: [number, number][] | number[][]) =>
		edges
			.map(([a, b]) => `M${M.nodes[a][0]} ${M.nodes[a][1]}L${M.nodes[b][0]} ${M.nodes[b][1]}`)
			.join('');

	const network = $derived(segments(M.edges.map(([a, b]) => [a, b])));
	const rings = $derived(
		M.buildings.map((b) => ({
			points: b.ring.map((p) => p.join(',')).join(' '),
			focus: b.focus,
			label: b.focus ? short(b.name) : null,
			at: centroid(b.ring)
		}))
	);

	const labelled = $derived(rings.filter((b) => b.label));

	// How many people walk each edge, bucketed so the weighting reads without
	// one element per edge.
	const traffic = $derived.by(() => {
		if (!crowd) return [];
		const load = new Map<string, number>();
		for (const { plan } of plans)
			for (const { leg } of plan.stops) {
				if (!leg) continue;
				for (let i = 1; i < leg.path.length; i++) {
					const k =
						Math.min(leg.path[i - 1], leg.path[i]) + ':' + Math.max(leg.path[i - 1], leg.path[i]);
					load.set(k, (load.get(k) ?? 0) + 1);
				}
			}
		const busiest = Math.max(1, ...load.values());
		const BUCKETS = 6;
		const byLoad: number[][][] = Array.from({ length: BUCKETS }, () => []);
		for (const [k, n] of load)
			byLoad[Math.min(BUCKETS - 1, Math.floor((n / busiest) * BUCKETS))].push(
				k.split(':').map(Number)
			);
		return byLoad
			.map((edges, i) => {
				const t = (i + 0.5) / BUCKETS;
				return {
					d: edges.length ? segments(edges) : '',
					width: (1.5 + 7 * t).toFixed(2),
					opacity: (0.2 + 0.65 * t).toFixed(2)
				};
			})
			.filter((b) => b.d);
	});

	const legs = $derived(
		crowd
			? []
			: plans.flatMap(({ plan }) =>
					plan.stops
						.filter((s) => s.leg)
						.map((s) => s.leg!.path.map((n) => M.nodes[n].join(',')).join(' '))
				)
	);

	// One pin per place, labelled with every time they turn up there.
	const pins = $derived.by(() => {
		const out: { x: number; y: number; at: string; home?: boolean }[] = [];
		for (const { plan } of plans) {
			const times = new Map<number, string[]>();
			for (const { s, node } of plan.located) {
				if (!times.has(node!)) times.set(node!, []);
				times.get(node!)!.push(hhmm(s.from));
			}
			for (const [node, at] of times) {
				const [x, y] = M.nodes[node];
				out.push({ x, y, at: at.join(', ') });
			}
			if (!crowd && plan.home != null) {
				const [x, y] = M.nodes[plan.home];
				out.push({ x, y, at: '', home: true });
			}
		}
		return out;
	});

	// ─── camera ─────────────────────────────────────────────────────────────

	let cam = $state({ x: 0, y: 0, w: 1, h: 1 });
	let full = $state(false);
	let svgEl: SVGSVGElement;

	// 1 at full campus, smaller as you go in. Pins and labels are sized in
	// metres, so they scale back by this to hold still on screen.
	const k = $derived(cam.w / home.w);
	const viewBox = $derived(`${cam.x} ${cam.y} ${cam.w} ${cam.h}`);

	// The view this map opens on: a crowd gets the whole campus, one player gets
	// their own day. Double-clicking asks for it back, which is more useful than
	// the whole village when you are looking at one person's morning.
	function reset() {
		if (crowd) fit();
		else frameRoute();
	}

	$effect(() => {
		// A new day, or a new person, reframes rather than leaving you looking at
		// where yesterday happened.
		day;
		people;
		reset();
	});

	function fit() {
		cam = { ...home };
	}

	function frameRoute() {
		const nodes = plans.flatMap((r) => [
			...r.plan.located.map((x) => x.node!),
			...(r.plan.home != null ? [r.plan.home] : []),
			...r.plan.stops.flatMap((x) => x.leg?.path ?? [])
		]);
		if (!nodes.length) return fit();
		const xs = nodes.map((n) => M.nodes[n][0]);
		const ys = nodes.map((n) => M.nodes[n][1]);
		const pad = 90;
		const scale = Math.min(
			4,
			Math.max(
				(Math.max(...xs) - Math.min(...xs) + pad * 2) / home.w,
				(Math.max(...ys) - Math.min(...ys) + pad * 2) / home.h,
				0.18
			)
		);
		const w = home.w * scale;
		const h = home.h * scale;
		cam = {
			w,
			h,
			x: (Math.min(...xs) + Math.max(...xs)) / 2 - w / 2,
			y: (Math.min(...ys) + Math.max(...ys)) / 2 - h / 2
		};
	}

	const at = (e: PointerEvent | WheelEvent) => {
		const r = svgEl.getBoundingClientRect();
		return {
			x: cam.x + ((e.clientX - r.left) / r.width) * cam.w,
			y: cam.y + ((e.clientY - r.top) / r.height) * cam.h
		};
	};

	function scaleAbout(factor: number, focus: { x: number; y: number }) {
		const next = Math.min(4, Math.max(0.05, k * factor));
		const f = next / k;
		cam = {
			// Keep whatever is under the cursor exactly where it is.
			x: focus.x - (focus.x - cam.x) * f,
			y: focus.y - (focus.y - cam.y) * f,
			w: home.w * next,
			h: home.h * next
		};
	}

	const zoomBy = (f: number) => scaleAbout(f, { x: cam.x + cam.w / 2, y: cam.y + cam.h / 2 });

	let drag: { x: number; y: number; id: number } | null = $state(null);

	function down(e: PointerEvent) {
		drag = { ...at(e), id: e.pointerId };
		svgEl.setPointerCapture(e.pointerId);
	}
	function move(e: PointerEvent) {
		if (!drag || e.pointerId !== drag.id) return;
		const now = at(e);
		cam = { ...cam, x: cam.x - (now.x - drag.x), y: cam.y - (now.y - drag.y) };
	}
	function up() {
		if (drag) svgEl.releasePointerCapture(drag.id);
		drag = null;
	}

	$effect(() => {
		if (!full) return;
		document.body.style.overflow = 'hidden';
		const esc = (e: KeyboardEvent) => {
			if (e.key !== 'Escape') return;
			e.stopImmediatePropagation();
			full = false;
		};
		addEventListener('keydown', esc, true);
		return () => {
			document.body.style.overflow = '';
			removeEventListener('keydown', esc, true);
		};
	});

	// "Center for Biblical and Theological Studies" needs no help swallowing the map.
	function short(name: string) {
		return name
			.replace(/\b(Center|Centre|Building)\b/g, 'Ctr')
			.replace(/\bBusiness and Communication\b/, 'Bus & Comm')
			.replace(/\bBiblical and Theological Studies\b/, 'Bible & Theo')
			.replace(/\bDigital Communications\b/, 'Digital Comm')
			.replace(/\bBusiness Administration\b/, 'Business')
			.replace(/\bEngineering and Science\b/, 'Eng & Science')
			.replace(/\bTechnology Resource\b/, 'Tech Resource')
			.replace(/\s+Ctr$/, '');
	}
	function centroid(ring: [number, number][]) {
		return [
			ring.reduce((a, p) => a + p[0], 0) / ring.length,
			ring.reduce((a, p) => a + p[1], 0) / ring.length
		];
	}

</script>

<!-- One root element. Dropped into a grid, a component with two roots becomes
     two grid items, which is how the controls and the map ended up in separate
     columns. -->
<div class="mapblock">
	{#if onday}
		<div class="controls">
			<div class="chips">
				{#each WEEK as d (d)}
					<Button
						variant={d === day ? 'default' : 'outline'}
						size="sm"
						onclick={() => onday?.(d)}
					>
						{DAYS[d]}
					</Button>
				{/each}
			</div>
			<div class="chips">
				<Button variant="outline" size="sm" onclick={() => zoomBy(1.4)} aria-label="Zoom out">
					−
				</Button>
				<Button variant="outline" size="sm" onclick={() => zoomBy(1 / 1.4)} aria-label="Zoom in">
					+
				</Button>
				<Button variant="outline" size="sm" onclick={fit}>fit</Button>
				<Button variant="outline" size="sm" onclick={() => (full = true)}>fullscreen</Button>
			</div>
		</div>
	{/if}

	<div class="plan" class:compact class:full>
		{#if full}
			<Button variant="outline" size="sm" class="exit" onclick={() => (full = false)}>
				close ✕
			</Button>
		{/if}
		<svg
			bind:this={svgEl}
			class="campus"
			class:dragging={drag}
			{viewBox}
			style="aspect-ratio:{home.w}/{home.h};--k:{k.toFixed(4)}"
			preserveAspectRatio="xMidYMid meet"
			onwheel={(e) => {
				e.preventDefault();
				scaleAbout(Math.exp(e.deltaY * 0.0015), at(e));
			}}
			onpointerdown={down}
			onpointermove={move}
			onpointerup={up}
			onpointercancel={up}
			ondblclick={reset}
			role="application"
			aria-label="Campus map"
		>
			<g class="paths"><path d={network} /></g>
			<g class="blds">
				{#each rings as b, i (i)}
					<polygon points={b.points} class={b.focus ? 'focus' : ''} />
				{/each}
			</g>
			<g class="routes">
				{#each traffic as t (t.width)}
					<path d={t.d} stroke-width={t.width} stroke-opacity={t.opacity} />
				{/each}
				{#each legs as points, i (i)}
					<polyline {points} />
				{/each}
			</g>
			<g class="pins">
				{#each pins as pin, i (i)}
					<circle cx={pin.x} cy={pin.y} class={pin.home ? 'home' : ''} />
					{#if !crowd && pin.at}
						<text x={pin.x + 10} y={pin.y + 4}>{pin.at}</text>
					{/if}
				{/each}
			</g>
			<g class="marks">
				{#each marks as m, i (i)}
					<circle cx={m.x} cy={m.y} />
					{#if !compact}
						<text x={m.x + 11} y={m.y - 6}>{m.label}</text>
					{/if}
				{/each}
			</g>
			<g class="labels">
				{#each labelled as b, i (i)}
					<text x={b.at[0]} y={b.at[1]}>{b.label}</text>
				{/each}
			</g>
		</svg>
	</div>
</div>

<style>
	.mapblock {
		display: grid;
		gap: 12px;
		align-content: start;
		min-width: 0;
	}

	.controls {
		display: flex;
		flex-wrap: wrap;
		gap: 12px;
		align-items: center;
		justify-content: space-between;
	}

	.plan {
		display: flex;
		justify-content: center;
		min-width: 0;
	}
	.plan.full {
		position: fixed;
		inset: 0;
		z-index: 40;
		margin: 0;
		padding: 14px;
		background: var(--color-bg);
		align-items: center;
	}
	.plan.full :global(.exit) {
		position: absolute;
		top: 16px;
		right: 18px;
		z-index: 1;
	}

	svg.campus {
		display: block;
		user-select: none;
		width: 100%;
		height: auto;
		max-width: 100%;
		max-height: 72vh;
		background: var(--color-sunk);
		border: 1px solid var(--color-line);
		border-radius: 3px;
		cursor: grab;
		touch-action: none;
	}
	.plan.compact svg.campus {
		max-height: 44vh;
	}
	.plan.full svg.campus {
		width: auto;
		height: 100%;
		max-height: none;
	}
	svg.campus.dragging {
		cursor: grabbing;
	}

	.paths path {
		fill: none;
		stroke: oklch(33% 0.013 60);
		stroke-width: 1.1;
		vector-effect: non-scaling-stroke;
	}
	.blds polygon {
		fill: oklch(26% 0.012 60);
		stroke: oklch(34% 0.014 60);
		stroke-width: 0.8;
		vector-effect: non-scaling-stroke;
	}
	.blds polygon.focus {
		fill: oklch(37% 0.026 70);
		stroke: oklch(52% 0.04 70);
	}

	.routes path,
	.routes polyline {
		stroke: var(--color-blood);
		fill: none;
		stroke-linecap: round;
		stroke-linejoin: round;
		vector-effect: non-scaling-stroke;
	}
	.routes polyline {
		stroke-width: 4;
		stroke-opacity: 0.85;
	}

	.pins circle {
		fill: var(--color-blood);
		stroke: var(--color-bg);
		stroke-width: 1.5;
		vector-effect: non-scaling-stroke;
		r: max(calc(6px * var(--k, 1)), 3px);
	}
	.pins circle.home {
		fill: var(--color-live);
	}
	.pins text {
		fill: var(--color-ink);
		font-family: var(--font-mono);
		font-weight: 500;
		font-size: max(calc(10px * var(--k, 1)), 5px);
	}

	/* A crossing is a place to wait, not a place either of you is going, so it
	   reads as a ring around the map rather than another pin on it. */
	.marks circle {
		fill: none;
		stroke: var(--color-warn);
		stroke-width: 2;
		vector-effect: non-scaling-stroke;
		r: max(calc(11px * var(--k, 1)), 6px);
	}
	.marks text {
		fill: var(--color-warn);
		font-family: var(--font-mono);
		font-weight: 600;
		font-size: max(calc(9px * var(--k, 1)), 5px);
	}

	.labels text {
		fill: oklch(72% 0.02 80);
		font-family: var(--font-mono);
		font-size: max(calc(8.5px * var(--k, 1)), 7px);
		text-anchor: middle;
		paint-order: stroke;
		stroke: var(--color-sunk);
		stroke-width: 0.3em; /* the halo tracks the text, whatever size it ends up */
		stroke-linejoin: round;
	}
</style>
