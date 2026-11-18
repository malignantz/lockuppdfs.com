<script lang="ts">
	/**
	 * Find in the document: a field, the match count, previous / next and close. For
	 * phones (no Ctrl/Cmd+F) and to step from page to page; the browser's own Find stays
	 * the desktop path and is never intercepted. Matches are searched in the same line
	 * strings the invisible text layer holds (find/lines.ts) and painted on it with the
	 * CSS Custom Highlight API (or marks, find/TextLayer.svelte, where that is missing).
	 * The parent places the bar and decides what "show this match" means: the grid scrolls
	 * to the page, the editor turns to it.
	 */
	import { onMount, tick, untrack } from 'svelte';
	import type { PageId, PageRef, Source, SourceId } from '../core/types';
	import Icon from '../ui/Icon.svelte';
	import IconButton from '../ui/IconButton.svelte';
	import { docText, linesOf } from './doc-text.svelte';
	import { find, highlightApi, type LayerHit } from './find.svelte';
	import { foldQuery, matchPages, type DocHit } from './match';
	import { findStatus } from './status';
	import { rangeBox, type LayerLine } from './lines';
	import type { StampBox } from '../core/types';

	interface Props {
		pages: readonly PageRef[];
		sources: readonly Source[];
		/** Index of the page in view (the editor's page): searching starts there. */
		anchor?: number;
		/** A page whose layer shows the whole page (the editor's crop tool). */
		wholePageId?: PageId | null;
		/** Show a match: its page, and where on the page (stamp space), when known. */
		onreveal: (pageId: PageId, box: StampBox | null) => void;
		onclose: () => void;
	}

	let { pages, sources, anchor = 0, wholePageId = null, onreveal, onclose }: Props = $props();

	const dt = docText();
	let input: HTMLInputElement | undefined = $state();

	onMount(() => {
		dt.start();
		input?.focus();
		input?.select();
		return () => {
			if (highlightApi) {
				CSS.highlights.delete('find-match');
				CSS.highlights.delete('find-current');
			}
			find.clearMarks();
		};
	});

	const byId = $derived(new Map<SourceId, Source>(sources.map((s) => [s.id, s])));
	const query = $derived(foldQuery(find.query));
	const perPage = $derived<(LayerLine[] | null)[]>(
		pages.map((p) => {
			const s = byId.get(p.sourceId);
			return s ? linesOf(dt, s, p, p.id === wholePageId) : null;
		})
	);
	const anyText = $derived(perPage.some((l) => !!l?.length));
	const result = $derived(matchPages(perPage, query));
	const hits = $derived(result.hits);

	/** The current match, by where it is (indices shift while pages are still being read). */
	let sel = $state.raw<{ id: PageId; line: number; start: number } | null>(null);
	const current = $derived(sel ? hits.findIndex((h) => pages[h.page]?.id === sel!.id && h.line === sel!.line && h.start === sel!.start) : -1);
	const hitPages = $derived(new Set(hits.map((h) => h.page)).size);

	const status = $derived(
		findStatus({
			query,
			hits: hits.length,
			truncated: result.truncated,
			current,
			pages: hitPages,
			reading: dt.enabled && !dt.complete ? dt.progress : null,
			noText: dt.complete && !anyText,
			skipped: dt.skipped
		})
	);

	function boxOf(h: DocHit): StampBox | null {
		const line = perPage[h.page]?.[h.line];
		return line ? rangeBox(line, h.start, h.end) : null;
	}

	function choose(i: number) {
		const h = hits[i];
		if (!h) return;
		const id = pages[h.page].id;
		sel = { id, line: h.line, start: h.start };
		onreveal(id, boxOf(h));
	}

	/** First match on or after the page in view. */
	function firstFrom(at: number): number {
		const i = hits.findIndex((h) => h.page >= at);
		return i >= 0 ? i : 0;
	}

	function step(d: 1 | -1) {
		const n = hits.length;
		if (!n) return;
		if (current < 0) {
			const i = firstFrom(anchor);
			choose(d === 1 ? i : (i - 1 + n) % n);
			return;
		}
		choose((current + d + n) % n);
	}

	// A new search starts at the page in view; the first match is shown as soon as there is one.
	let lastQuery = '';
	$effect(() => {
		const q = query;
		const n = hits.length;
		untrack(() => {
			if (q !== lastQuery) {
				lastQuery = q;
				sel = null;
			}
			if (q && n && (!sel || current < 0)) choose(firstFrom(anchor));
		});
	});

	// Marks: the grid's tiles, and the matches on the layers.
	$effect(() => {
		const hs = hits;
		const cur = current;
		void anchor;
		const ids = pages.map((p) => p.id);
		const counts = new Map<PageId, number>();
		for (const h of hs) counts.set(ids[h.page], (counts.get(ids[h.page]) ?? 0) + 1);
		find.pages = counts;
		find.currentPage = cur >= 0 ? ids[hs[cur].page] : null;
		if (!highlightApi) {
			const byPage = new Map<PageId, LayerHit[]>();
			hs.forEach((h, i) => {
				const id = ids[h.page];
				let list = byPage.get(id);
				if (!list) byPage.set(id, (list = []));
				list.push({ line: h.line, start: h.start, end: h.end, current: i === cur });
			});
			find.layerHits = byPage;
			return;
		}
		let stale = false;
		void tick().then(() => !stale && paint(hs, cur, ids));
		return () => (stale = true);
	});

	function paint(hs: readonly DocHit[], cur: number, ids: readonly PageId[]) {
		const layers = new Map<string, Element[]>();
		for (const el of document.querySelectorAll('.text-layer[data-find-page]')) {
			const id = (el as HTMLElement).dataset.findPage!;
			const list = layers.get(id);
			if (list) list.push(el);
			else layers.set(id, [el]);
		}
		const all: Range[] = [];
		const now: Range[] = [];
		hs.forEach((h, i) => {
			for (const layer of layers.get(ids[h.page]) ?? []) {
				const t = layer.firstElementChild?.children[h.line]?.firstChild;
				if (!(t instanceof Text)) continue;
				const r = new Range();
				r.setStart(t, Math.min(h.start, t.length));
				r.setEnd(t, Math.min(h.end, t.length));
				(i === cur ? now : all).push(r);
			}
		});
		const currentHl = new Highlight(...now);
		currentHl.priority = 1;
		CSS.highlights.set('find-match', new Highlight(...all));
		CSS.highlights.set('find-current', currentHl);
	}

	function onkeydown(e: KeyboardEvent) {
		if (e.key === 'Enter') {
			e.preventDefault();
			step(e.shiftKey ? -1 : 1);
		} else if (e.key === 'Escape') {
			e.preventDefault();
			e.stopPropagation();
			onclose();
		}
	}

	export function focus() {
		input?.focus();
		input?.select();
	}
</script>

<div class="find-bar" role="search" aria-label="Find in this document" data-testid="find-bar">
	<div class="row">
		<label class="field">
			<Icon name="search" size={18} />
			<input
				bind:this={input}
				bind:value={find.query}
				type="search"
				enterkeyhint="search"
				autocomplete="off"
				spellcheck="false"
				placeholder="Find in document"
				aria-label="Find in document"
				aria-describedby="find-status"
				{onkeydown}
			/>
		</label>
		<span class="count num" data-testid="find-count">{status.count}{#if status.where}<span class="where">{` ${status.where}`}</span>{/if}</span>
		<div class="buttons">
			<IconButton icon="chevron-up" label="Previous match" shortcut="Shift+Enter" tooltip="bottom" disabled={!hits.length} onclick={() => step(-1)} />
			<IconButton icon="chevron-down" label="Next match" shortcut="Enter" tooltip="bottom" disabled={!hits.length} onclick={() => step(1)} />
			<IconButton icon="close" label="Close find" shortcut="Esc" tooltip="bottom" onclick={onclose} />
		</div>
	</div>
	<p id="find-status" class="status" role="status">{status.said}</p>
	{#if status.note}<p class="note" data-testid="find-note">{status.note}</p>{/if}
</div>

<style>
	.find-bar {
		display: grid;
		gap: 2px;
		padding: var(--s-1) var(--s-1) var(--s-1) var(--s-3);
		border: 1px solid var(--line);
		border-radius: var(--radius-sheet);
		background: var(--surface);
		box-shadow: var(--shadow-float);
		color: var(--ink);
	}

	.row {
		display: flex;
		align-items: center;
		gap: var(--s-2);
		min-width: 0;
	}

	.field {
		display: flex;
		flex: 1;
		align-items: center;
		gap: var(--s-2);
		min-width: 0;
		color: var(--ink-soft);
	}

	input {
		flex: 1;
		min-width: 0;
		height: var(--control-h);
		padding: 0;
		border: 0;
		background: transparent;
		color: var(--ink);
		font: inherit;
		font-size: var(--text-control);
	}

	input:focus-visible {
		outline: none;
	}

	/* The bar is the field: its focus ring goes round the bar. */
	.find-bar:has(input:focus-visible) {
		outline: 2px solid var(--accent);
		outline-offset: 2px;
	}

	input::-webkit-search-cancel-button {
		display: none;
	}

	.count {
		flex: none;
		font-size: var(--text-caption);
		color: var(--ink-soft);
		white-space: nowrap;
	}

	.buttons {
		display: flex;
		flex: none;
		gap: 2px;
	}

	.status {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip-path: inset(50%);
		white-space: nowrap;
	}

	.note {
		margin: 0;
		padding: 0 var(--s-2) var(--s-1) 26px;
		font-size: var(--text-caption);
		color: var(--ink-soft);
	}

	@media (max-width: 599px) {
		.find-bar {
			padding-left: var(--s-2);
		}

		.where {
			display: none;
		}

		.buttons :global(.icon-btn) {
			width: 44px;
			height: 44px;
		}
	}
</style>
