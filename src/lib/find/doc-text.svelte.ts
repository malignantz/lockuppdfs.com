/**
 * The words of every page of the open document, for the invisible text layer (so the
 * browser's own Find, Ctrl/Cmd+F, finds words on any page) and the Find bar.
 *
 * Read in the background, one page at a time, in the app's engine worker
 * (Engine.pageText, MuPDF), each page when the main thread is idle and with a pause
 * between pages, so it never holds up the interface or the thumbnails (PDF.js draws
 * those in its own worker). Pages are read in document order, a file's pages together.
 * Results are kept until their file goes away (editor/page-text.svelte.ts `pinned`),
 * so the editor never reads a page twice either.
 *
 * When: on a desktop (a mouse or trackpad, workspace/ocr-option.ts isDesktop) as soon
 * as a document is open; on phones and tablets only once the Find bar is opened (the
 * first page loads MuPDF, about 10 MB, which a phone should not fetch or run unasked).
 * Nothing is read while an export runs or the tab is hidden.
 *
 * Caps: the first PAGE_CAP source pages of the document, and no more once CHAR_CAP
 * characters are held (lower on phones); pages past either have no layer and the Find bar says how many
 * pages it searched. Scans without text get words only where the background scan reader
 * (editor/scan-reader.svelte.ts, desktop) has read them.
 */
import type { Engine, PageRef, PageText, Source, SourceId } from '../core/types';
import { readPinned, pinnedText, readText, unpinExcept } from '../editor/page-text.svelte';
import { scanReader } from '../editor/scan-reader.svelte';
import { isDesktop } from '../workspace/ocr-option';
import { fullSize, shownSize } from '../doc/crop';
import { getApp } from '../app';
import { pageLines, type LayerLine } from './lines';

/**
 * Source pages read for the layer, in document order, and characters held across the
 * document (reading stops past either). Measured 2026-11-18 (Chrome, dense 45-line pages,
 * about 3,000 characters each): 300 pages read in 17 s, JS heap +40 MB; 1,000 pages in
 * 55 s, +290 MB, 46,000 line elements. Phones and tablets get a quarter of that.
 */
export const PAGE_CAP = 1000;
export const CHAR_CAP = 2_000_000;
export const PAGE_CAP_PHONE = 300;
export const CHAR_CAP_PHONE = 600_000;
/** Wait after a document opens before the first page is read (thumbnails first). */
const START_DELAY_MS = 800;
/** Pause between two pages. */
const GAP_MS = 25;
/** Reading stops after this many failures in a row (offline before MuPDF was ever fetched, say) until the document changes. */
const MAX_FAILS = 3;

export interface DocTextOptions {
	engine: Pick<Engine, 'pageText'>;
	/** Read as soon as a document is open (default: desktops). Otherwise only after start(). */
	eager?: () => boolean;
	/** Runs `fn` when the main thread is idle (default requestIdleCallback). */
	idle?: (fn: () => void) => void;
	setTimeout?: (fn: () => void, ms: number) => unknown;
	clearTimeout?: (t: unknown) => void;
	pageCap?: number;
	charCap?: number;
}

const keyOf = (sourceId: SourceId, pageIndex: number) => `${sourceId}:${pageIndex}`;

function defaultIdle(fn: () => void) {
	if (typeof requestIdleCallback === 'function') requestIdleCallback(() => fn(), { timeout: 1000 });
	else setTimeout(fn, 30);
}

export class DocText {
	readonly #engine: Pick<Engine, 'pageText'>;
	readonly #eager: () => boolean;
	readonly #idle: (fn: () => void) => void;
	readonly #setT: (fn: () => void, ms: number) => unknown;
	readonly #clearT: (t: unknown) => void;
	readonly #pageCap: number;
	readonly #charCap: number;

	#sources = new Map<SourceId, Source>();
	/** Source pages to read (keys), document order, capped. */
	#order = $state.raw<string[]>([]);
	/** Pages in the document past the caps (not read). */
	#over = $state(0);
	#failed = new Set<string>();
	#done = $state(0);
	#chars = 0;
	#charCapped = $state(false);
	#withWords = $state(0);
	#enabled = $state(false);
	#holds = new Set<string>();
	#failsInARow = 0;
	#running = false;
	#timer: unknown = null;
	/** Bumped on every sync: a read from an older document is still kept, but does not chain. */
	#gen = 0;

	constructor(opts: DocTextOptions) {
		this.#engine = opts.engine;
		this.#eager = opts.eager ?? isDesktop;
		this.#idle = opts.idle ?? defaultIdle;
		this.#setT = opts.setTimeout ?? ((fn, ms) => setTimeout(fn, ms));
		this.#clearT = opts.clearTimeout ?? ((t) => clearTimeout(t as ReturnType<typeof setTimeout>));
		const desk = this.#eager();
		this.#pageCap = opts.pageCap ?? (desk ? PAGE_CAP : PAGE_CAP_PHONE);
		this.#charCap = opts.charCap ?? (desk ? CHAR_CAP : CHAR_CAP_PHONE);
	}

	/** The open document changed (the workspace calls this on every change of its pages or sources). */
	sync(sources: readonly Source[], pages: readonly PageRef[]): void {
		this.#gen++;
		this.#failsInARow = 0;
		this.#sources = new Map(sources.map((s) => [s.id, s]));
		unpinExcept(new Set(this.#sources.keys()));
		// Unique source pages in document order, a file's pages together (MuPDF keeps two files open).
		const bySource = new Map<SourceId, Set<number>>();
		for (const p of pages) {
			const s = this.#sources.get(p.sourceId);
			if (s?.kind !== 'pdf') continue;
			let set = bySource.get(s.id);
			if (!set) bySource.set(s.id, (set = new Set()));
			set.add(p.pageIndex);
		}
		const all: string[] = [];
		for (const [id, set] of bySource) for (const i of set) all.push(keyOf(id, i));
		const order = all.slice(0, this.#pageCap);
		this.#over = all.length - order.length;
		this.#order = order;
		for (const k of [...this.#failed]) if (!this.#sources.has(k.slice(0, k.lastIndexOf(':')))) this.#failed.delete(k);
		this.#recount();
		if (!order.length) {
			this.#chars = 0;
			this.#charCapped = false;
		}
		if (order.length && this.#eager()) this.#enabled = true;
		this.#schedule(START_DELAY_MS);
	}

	/** Start reading (the Find bar opened). */
	start(): void {
		if (this.#enabled) return;
		this.#enabled = true;
		this.#schedule(0);
	}

	/** Holds the reading for a reason ('export', 'hidden'); it goes on when no reason is left. */
	hold(reason: string, on: boolean): void {
		if (on) this.#holds.add(reason);
		else if (this.#holds.delete(reason)) this.#schedule(GAP_MS);
	}

	get enabled(): boolean {
		return this.#enabled;
	}

	/** Pages to read and read so far (reactive). */
	get progress(): { done: number; total: number } {
		return { done: this.#done, total: this.#order.length };
	}

	/** Every page that will be read has been (reactive). */
	get complete(): boolean {
		return this.#enabled && this.#done >= this.#order.length;
	}

	/** Pages of the document not read because of the caps (reactive). */
	get skipped(): number {
		if (this.#charCapped) return this.#over + Math.max(0, this.#order.length - this.#done);
		return this.#over;
	}

	/** Pages read that have words of their own (reactive). */
	get pagesWithWords(): number {
		return this.#withWords;
	}

	/** The document has PDF pages (where words may be). */
	get hasPdfPages(): boolean {
		return this.#order.length + this.#over > 0;
	}

	/** Reading starts with the document (a desktop), not only when Find is opened. */
	get eager(): boolean {
		return this.#eager();
	}

	/** Some page read so far has words, its own or read from a scan (reactive). */
	get hasText(): boolean {
		if (this.#withWords > 0) return true;
		const scans = scanReader();
		for (const k of this.#order) {
			const i = k.lastIndexOf(':');
			const v = scans.page(k.slice(0, i), Number(k.slice(i + 1)));
			if (v.state === 'done' && v.text?.words.length) return true;
		}
		return false;
	}

	/**
	 * Whether to offer Find: once a page with text is known; on a phone (nothing read
	 * until Find is opened) for any PDF until reading shows it has no text.
	 */
	get offer(): boolean {
		if (this.hasText) return true;
		return !this.#eager() && this.hasPdfPages && !this.complete;
	}

	/**
	 * The words of a page as the layer and Find use them: the file's own words, else on a
	 * scan without text the words the background scan reader found; undefined until read.
	 */
	text(source: Source, pageIndex: number): PageText | undefined {
		if (source.kind !== 'pdf') return undefined;
		const own = readText(source.id, pageIndex);
		if (own && own.words.length) return own;
		const scan = scanReader().page(source.id, pageIndex);
		if (scan.state === 'done' && scan.text?.words.length) return scan.text;
		return own;
	}

	#recount() {
		let done = 0;
		let words = 0;
		for (const k of this.#order) {
			const i = k.lastIndexOf(':');
			const t = pinnedText(k.slice(0, i), Number(k.slice(i + 1)));
			if (t) {
				done++;
				if (t.words.length) words++;
			} else if (this.#failed.has(k)) done++;
		}
		this.#done = done;
		this.#withWords = words;
	}

	#schedule(ms: number) {
		if (this.#timer !== null) this.#clearT(this.#timer);
		this.#timer = this.#setT(() => {
			this.#timer = null;
			this.#pump();
		}, ms);
	}

	#next(): string | null {
		for (const k of this.#order) {
			if (this.#failed.has(k)) continue;
			const i = k.lastIndexOf(':');
			if (!pinnedText(k.slice(0, i), Number(k.slice(i + 1)))) return k;
		}
		return null;
	}

	#pump() {
		if (this.#running || !this.#enabled || this.#holds.size || this.#charCapped || this.#failsInARow >= MAX_FAILS) return;
		const key = this.#next();
		if (!key) {
			this.#recount();
			return;
		}
		const i = key.lastIndexOf(':');
		const source = this.#sources.get(key.slice(0, i));
		if (!source) return;
		const pageIndex = Number(key.slice(i + 1));
		const gen = this.#gen;
		this.#running = true;
		this.#idle(() => {
			readPinned(this.#engine, source, pageIndex)
				.then(
					(t) => {
						this.#failsInARow = 0;
						for (const w of t.words) this.#chars += w.text.length + 1;
						if (this.#chars > this.#charCap) this.#charCapped = true;
					},
					(e) => {
						console.warn('Could not read the page text for Find', e);
						this.#failed.add(key);
						this.#failsInARow++;
					}
				)
				.finally(() => {
					this.#running = false;
					this.#recount();
					if (gen === this.#gen) this.#schedule(GAP_MS);
				});
		});
	}
}

let shared: DocText | null = null;

/** The app's one document reader (the workspace feeds it; the layer and Find read it). */
export function docText(): DocText {
	if (!shared) {
		shared = new DocText({ engine: getApp().engine });
		if (typeof document !== 'undefined') {
			const onVis = () => shared?.hold('hidden', document.visibilityState === 'hidden');
			document.addEventListener('visibilitychange', onVis);
			onVis();
		}
	}
	return shared;
}

/** Shown size of a page (width / height) as the layer lays it out. */
export function shownAspect(source: Source, page: Pick<PageRef, 'pageIndex' | 'rotation' | 'crop'>, wholePage = false): number {
	const size = source.pages[page.pageIndex];
	if (!size) return 1;
	const s = wholePage ? fullSize(size, page.rotation) : shownSize(size, page.rotation, page.crop);
	return s.height > 0 ? s.width / s.height : 1;
}

/** Lines per PageText and page view, so the layer and Find share one list (and its indices). */
const linesCache = new WeakMap<PageText, Map<string, LayerLine[]>>();

/** The lines of a page as shown (reactive through DocText.text). Empty until read or without words. */
export function linesOf(dt: DocText, source: Source | undefined, page: PageRef, wholePage = false): LayerLine[] {
	if (!source) return [];
	const text = dt.text(source, page.pageIndex);
	if (!text || !text.words.length) return [];
	const redacts = page.stamps.filter((s) => s.kind === 'redact').map((s) => (s.kind === 'redact' ? s.box : null));
	const viewKey = `${page.rotation}|${wholePage ? 'w' : ''}|${page.crop ? `${page.crop.x},${page.crop.y},${page.crop.w},${page.crop.h}` : ''}|${redacts.map((b) => `${b!.x},${b!.y},${b!.w},${b!.h}`).join(';')}`;
	let byView = linesCache.get(text);
	if (!byView) linesCache.set(text, (byView = new Map()));
	let lines = byView.get(viewKey);
	if (!lines) {
		lines = pageLines(text, page, shownAspect(source, page, wholePage), wholePage);
		if (byView.size > 8) byView.clear();
		byView.set(viewKey, lines);
	}
	return lines;
}
