<script lang="ts" module>
	/** Width of the layer's own frame, in CSS px; the frame is scaled to the page. */
	const REF = 1000;
	/** Font size the widths are measured at. */
	const MEASURE_PX = 100;
	let ctx: CanvasRenderingContext2D | null | undefined;
	const widths = new WeakMap<object, number>();

	/** Width of a line's text at MEASURE_PX in the layer's font (canvas, no layout). */
	function measure(line: { text: string }): number {
		let w = widths.get(line);
		if (w !== undefined) return w;
		if (ctx === undefined) {
			ctx = typeof document !== 'undefined' ? document.createElement('canvas').getContext('2d') : null;
			if (ctx) ctx.font = `${MEASURE_PX}px sans-serif`;
		}
		w = ctx ? ctx.measureText(line.text).width : line.text.length * MEASURE_PX * 0.5;
		widths.set(line, w);
		return w;
	}
</script>

<script lang="ts">
	/**
	 * An invisible copy of a page's text over its picture, so the browser's own Find
	 * (Ctrl/Cmd+F) finds and highlights words on the page, and the Find bar can paint
	 * its matches (CSS Custom Highlight API ranges over these text nodes).
	 *
	 * One element per line (words joined by single spaces, so a phrase within a line
	 * matches and two lines never run together), laid over the line's box: the text is
	 * set at the line's height and squeezed or stretched along the line to its length
	 * (measured once on a canvas), turned with the page. All of it in a fixed
	 * 1000-px-wide frame scaled to the page, so font sizes stay ordinary (no minimum font
	 * size or phone text autosizing interferes) and range rectangles are exact.
	 *
	 * Transparent, no pointer events, not selectable, hidden from assistive technology
	 * (the page already has its label): it never takes a click, a drag or a selection.
	 */
	import type { PageId } from '../core/types';
	import type { LayerLine } from './lines';
	import { find, highlightApi } from './find.svelte';

	let { lines, aspect, pageId }: { lines: readonly LayerLine[]; aspect: number; pageId: PageId } = $props();

	let w = $state(0);
	const height = $derived(REF / (aspect > 0 ? aspect : 1));
	const scale = $derived(w > 0 ? w / REF : 0.2);

	function lineStyle(l: LayerLine): string {
		const b = l.box;
		const flat = l.angle === 0 || l.angle === 180;
		const along = flat ? b.w * REF : b.h * height;
		const thick = flat ? b.h * height : b.w * REF;
		const cx = (b.x + b.w / 2) * REF;
		const cy = (b.y + b.h / 2) * height;
		const natural = (measure(l) * thick) / MEASURE_PX;
		const sx = natural > 0 ? along / natural : 1;
		return (
			`left:${cx.toFixed(2)}px;top:${cy.toFixed(2)}px;font-size:${thick.toFixed(2)}px;line-height:${thick.toFixed(2)}px;` +
			`transform:rotate(${l.angle}deg) scaleX(${sx.toFixed(4)}) translate(-50%,-50%)`
		);
	}

	/** Without the Custom Highlight API: this page's matches, painted with marks. */
	const own = $derived(highlightApi ? undefined : find.layerHits.get(pageId));
	const byLine = $derived.by(() => {
		const m = new Map<number, { start: number; end: number; current: boolean }[]>();
		for (const h of own ?? []) {
			let list = m.get(h.line);
			if (!list) m.set(h.line, (list = []));
			list.push(h);
		}
		return m;
	});

	function pieces(text: string, hits: { start: number; end: number; current: boolean }[]) {
		const out: { text: string; mark: 0 | 1 | 2 }[] = [];
		let at = 0;
		for (const h of hits) {
			if (h.start > at) out.push({ text: text.slice(at, h.start), mark: 0 });
			out.push({ text: text.slice(h.start, h.end), mark: h.current ? 2 : 1 });
			at = h.end;
		}
		if (at < text.length) out.push({ text: text.slice(at), mark: 0 });
		return out;
	}
</script>

<div class="text-layer" aria-hidden="true" data-find-page={pageId} bind:clientWidth={w}>
	<div class="frame" style:width="{REF}px" style:height="{height}px" style:transform="scale({scale})">
		{#each lines as l, i (l)}
			{@const hits = byLine.get(i)}
			<div class="ln" data-l={i} style={lineStyle(l)}>{#if hits}{#each pieces(l.text, hits) as p, k (k)}{#if p.mark}<mark class:current={p.mark === 2}>{p.text}</mark>{:else}{p.text}{/if}{/each}{:else}{l.text}{/if}</div>
		{/each}
	</div>
</div>

<style>
	.text-layer {
		position: absolute;
		inset: 0;
		overflow: hidden;
		pointer-events: none;
		user-select: none;
		-webkit-user-select: none;
		-webkit-touch-callout: none;
		contain: strict;
		/* Kept invisible in forced-colours (high contrast) mode too. */
		forced-color-adjust: none;
		color: transparent;
	}

	.frame {
		position: absolute;
		top: 0;
		left: 0;
		transform-origin: 0 0;
	}

	.ln {
		position: absolute;
		transform-origin: 0 0;
		white-space: pre;
		font-family: sans-serif;
		font-weight: 400;
		font-style: normal;
		letter-spacing: 0;
		word-spacing: 0;
		text-transform: none;
		-webkit-text-size-adjust: none;
		text-size-adjust: none;
		color: transparent;
		cursor: default;
	}

	mark {
		color: transparent;
		background: var(--find-match);
	}

	mark.current {
		background: var(--find-current);
	}
</style>
