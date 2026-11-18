/**
 * The words of source pages for the text highlighter, read from the engine (in its
 * worker, off the main thread) once per page and kept for the visit. Reading is
 * reactive: `pageTextOf` says 'loading' until the engine answers, and components that
 * read it update when it does. The first call loads MuPDF in the worker (about 10 MB,
 * cached after); nothing else waits for it.
 */
import { SvelteMap } from 'svelte/reactivity';
import type { Engine, PageText, Source } from '../core/types';

export type PageTextState =
	| { status: 'loading' }
	/** `scanned`: the words were read from the page's picture (editor/scan-reader.svelte.ts), not the file's own text. */
	| { status: 'ready'; text: PageText; scanned?: boolean }
	/** A scan without text whose words are being read in the background (the editor's state, never pageTextOf's). */
	| { status: 'reading' }
	/** The engine could not read the page's text. */
	| { status: 'failed' };

const LOADING: PageTextState = Object.freeze({ status: 'loading' });
const FAILED: PageTextState = Object.freeze({ status: 'failed' });
/** Pages kept; a page is a few kilobytes to a few hundred. */
const KEEP = 60;

const known = new SvelteMap<string, PageTextState>();
const asked = new Set<string>();
/**
 * Pages read for the whole document (find/doc-text.svelte.ts: the invisible text layer
 * and Find), kept until their file goes away (not trimmed to KEEP: the layer needs every page).
 */
const pinned = new SvelteMap<string, PageText>();

/** True once any page's text has been read this visit (MuPDF is then loaded, so reading ahead is cheap). */
let warm = $state(false);
export const textWarm = () => warm;

export function pageTextOf(engine: Pick<Engine, 'pageText'>, source: Source | undefined, pageIndex: number): PageTextState {
	if (!source) return LOADING;
	if (source.kind !== 'pdf') return { status: 'ready', text: { words: [], skipped: 0 } };
	const key = `${source.id}:${pageIndex}`;
	const pin = pinned.get(key);
	if (pin) return { status: 'ready', text: pin };
	const got = known.get(key);
	if (got) return got;
	if (!asked.has(key)) {
		asked.add(key);
		// Started outside the reading effect: the write happens later, in a callback.
		queueMicrotask(() => {
			engine.pageText(source, pageIndex).then(
				(text) => {
					warm = true;
					known.set(key, { status: 'ready', text: Object.freeze(text) as PageText });
					trim();
				},
				(e) => {
					console.warn('Could not read the page text', e);
					known.set(key, FAILED);
				}
			);
		});
	}
	return LOADING;
}

function trim() {
	while (known.size > KEEP) {
		const first = known.keys().next().value!;
		known.delete(first);
		asked.delete(first);
	}
}

/** A page's words read for the whole document, or undefined (reactive). */
export function pinnedText(sourceId: string, pageIndex: number): PageText | undefined {
	return pinned.get(`${sourceId}:${pageIndex}`);
}

/** A page's words if read by either path (the whole document or the editor's own), else undefined (reactive). */
export function readText(sourceId: string, pageIndex: number): PageText | undefined {
	const key = `${sourceId}:${pageIndex}`;
	const pin = pinned.get(key);
	if (pin) return pin;
	const k = known.get(key);
	return k?.status === 'ready' ? k.text : undefined;
}

/**
 * Read a page's words and keep them until `unpin` (find/doc-text.svelte.ts). A page the
 * editor already read is not read again.
 */
export async function readPinned(engine: Pick<Engine, 'pageText'>, source: Source, pageIndex: number): Promise<PageText> {
	const key = `${source.id}:${pageIndex}`;
	const have = pinned.get(key);
	if (have) return have;
	const got = known.get(key);
	let text: PageText;
	if (got?.status === 'ready') text = got.text;
	else if (source.kind !== 'pdf') text = Object.freeze({ words: [], skipped: 0 }) as PageText;
	else {
		text = Object.freeze(await engine.pageText(source, pageIndex)) as PageText;
		warm = true;
	}
	pinned.set(key, text);
	return text;
}

/** Forget the pinned pages of sources not in `keep`. */
export function unpinExcept(keep: ReadonlySet<string>): void {
	for (const key of [...pinned.keys()]) if (!keep.has(key.slice(0, key.lastIndexOf(':')))) pinned.delete(key);
}
