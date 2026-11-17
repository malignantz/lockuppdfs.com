/**
 * Reads the text of scanned pages in the background on a desktop, so Select text, Copy
 * and Highlight > Text work on a scan without exporting first. Files never leave the
 * device: the reading runs in its own engine worker (a second copy of the engine
 * worker, so opening files, thumbnails and the editor's own text reading never wait
 * behind it), with the export's OCR (Engine.readScanPage). Which pages and in what order:
 * scan-queue.ts. Phones and tablets: nothing is read (isDesktop(), as the export option).
 *
 * One page at a time, with a pause between pages; nothing starts while an export runs
 * or the tab is hidden; when a file goes away mid-page its worker is stopped; when there
 * is nothing left to read for a while the worker is stopped (its memory, about
 * 0.3–0.4 GB with the OCR engine loaded, goes back).
 */
import type { EngineClient } from '../engine/client';
import { createEngine } from '../engine/client';
import type { OcrKnownPage, PageRef, PageText, Source, SourceId } from '../core/types';
import { isDesktop } from '../workspace/ocr-option';
import { toasts } from '../ui/toasts.svelte';
import { BAR_AFTER_MS, PRIOR_PAGE_MS, QUEUE_CONFIG, ScanQueue, sourceOfKey, waitEstimate, type PageState, type QueueConfig } from './scan-queue';

export const DONE_NOTICE = 'Text in this scan can now be selected.';
/** Said instead when only the first pages of a long scan were read (the others are read as they are opened). */
export const DONE_FIRST_NOTICE = 'Text on the first pages of this scan can now be selected.';

/** Pause between two pages, so the reader never runs back to back with the page. */
const YIELD_MS = 300;
/** The reading worker is stopped after this long with nothing to read. */
const IDLE_MS = 30_000;

interface Kept {
	known: OcrKnownPage;
	text: PageText;
}

export interface ScanPageView {
	state: PageState;
	/** The words, once read (possibly none). */
	text?: PageText;
}

export interface ScanWait {
	/** Pages of the current reading done, of how many. */
	done: number;
	total: number;
	/** Expected wait for the page, ms; null before any page has been timed. */
	ms: number | null;
	/** The wait is long enough for a progress bar (more than about 5 seconds). */
	long: boolean;
}

export interface ScanReaderOptions {
	/** Engine for the reading (default: a new engine worker of its own). */
	createEngine?: () => EngineClient;
	enabled?: () => boolean;
	config?: QueueConfig;
	notify?: (message: string) => void;
	now?: () => number;
	/** Timers (tests). */
	setTimeout?: (fn: () => void, ms: number) => unknown;
	clearTimeout?: (t: unknown) => void;
}

export class ScanReader {
	#changes = $state(0);
	#queue: ScanQueue<Kept>;
	#engine: EngineClient | null = null;
	readonly #make: () => EngineClient;
	readonly #enabled: () => boolean;
	readonly #cfg: QueueConfig;
	readonly #notify: (m: string) => void;
	readonly #now: () => number;
	readonly #setT: (fn: () => void, ms: number) => unknown;
	readonly #clearT: (t: unknown) => void;
	#sources = new Map<SourceId, Source>();
	#pages: readonly PageRef[] = [];
	/** Qualifying pages per listed source; 'pending' while asked. */
	#listing = new Map<SourceId, number[] | 'pending'>();
	#held = new Set<string>();
	#running = false;
	#startedAt = 0;
	#pageMs: number[] = [];
	/** Sources whose pages got words in this batch, and those already announced. */
	#gotWords = new Set<SourceId>();
	#announced = new Set<SourceId>();
	#idle: unknown = null;
	#pumpTimer: unknown = null;
	/** Bumped when the worker is replaced: answers from an older one are dropped. */
	#generation = 0;

	constructor(opts: ScanReaderOptions = {}) {
		this.#make = opts.createEngine ?? (() => createEngine({ createWorker: () => new Worker(new URL('../engine/worker.ts', import.meta.url), { type: 'module', name: 'pdf-scan-reader' }) }));
		this.#enabled = opts.enabled ?? isDesktop;
		this.#cfg = opts.config ?? QUEUE_CONFIG;
		this.#queue = new ScanQueue<Kept>(this.#cfg);
		this.#notify = opts.notify ?? ((message) => void toasts.show({ message, tone: 'info' }));
		this.#now = opts.now ?? (() => performance.now());
		this.#setT = opts.setTimeout ?? ((fn, ms) => setTimeout(fn, ms));
		this.#clearT = opts.clearTimeout ?? ((t) => clearTimeout(t as ReturnType<typeof setTimeout>));
	}

	/** The open document changed (Workspace calls this on every change of its pages or sources). */
	sync(sources: readonly Source[], pages: readonly PageRef[]): void {
		if (!this.#enabled()) return;
		const ids = new Set(sources.map((s) => s.id));
		this.#sources = new Map(sources.map((s) => [s.id, s]));
		this.#pages = pages;
		for (const id of [...this.#listing.keys()]) if (!ids.has(id)) this.#listing.delete(id);
		for (const id of [...this.#announced]) if (!ids.has(id)) this.#announced.delete(id);
		// A file that went away while one of its pages is being read: stop that reading now.
		const flying = this.#queue.reading;
		if (flying && !ids.has(sourceOfKey(flying))) this.#stopEngine();
		if (!pages.length) this.#stopEngine();
		this.#listMissing();
		this.#rebuild();
	}

	/** The page the editor shows, or null when it closes. */
	view(sourceId: SourceId | null, pageIndex = 0): void {
		if (!this.#enabled()) return;
		// A file too large to read: the editor shows it as before.
		const s = sourceId ? this.#sources.get(sourceId) : undefined;
		if (sourceId && (!s || !this.#readable(s))) sourceId = null;
		this.#queue.view(sourceId ? `${sourceId}:${pageIndex}` : null);
		this.#changed();
	}

	/** Holds the reading (`on`) for a reason ('export', 'hidden'); it goes on when no reason is left. */
	hold(reason: string, on: boolean): void {
		if (on) this.#held.add(reason);
		else this.#held.delete(reason);
		this.#changed();
	}

	/** What is known of a source page's reading (reactive). */
	page(sourceId: SourceId, pageIndex: number): ScanPageView {
		void this.#changes;
		const key = `${sourceId}:${pageIndex}`;
		const state = this.#queue.state(key);
		return state === 'done' ? { state, text: this.#queue.result(key)!.value.text } : { state };
	}

	/** How long until a source page has its words (reactive; `now` makes it tick). */
	wait(sourceId: SourceId, pageIndex: number, now = this.#now()): ScanWait | null {
		void this.#changes;
		const key = `${sourceId}:${pageIndex}`;
		const n = this.#queue.pagesUntil(key);
		if (n === null || n === 0) return null;
		const inFlight = this.#queue.reading !== null;
		const ms = waitEstimate(this.#pageMs, n, now - this.#startedAt, inFlight);
		const expected = ms ?? waitEstimate([PRIOR_PAGE_MS], n, now - this.#startedAt, inFlight)!;
		const { done, total } = this.#queue.progress();
		return { done, total, ms, long: expected > BAR_AFTER_MS };
	}

	/** Pages read so far, for an export to reuse (ExportOptions.ocrKnown). */
	known(): OcrKnownPage[] {
		return this.#queue.values().map((k) => k.known);
	}

	/** Page times measured so far (ms), for measurements. */
	get pageTimes(): readonly number[] {
		return this.#pageMs;
	}

	// ------------------------------------------------------------------ inside

	/** Lists the qualifying pages of every open file not listed yet (long files are not listed). */
	#listMissing() {
		for (const s of this.#sources.values()) {
			if (!this.#readable(s) || this.#listing.has(s.id) || s.pages.length > this.#cfg.maxDocPages) continue;
			this.#list(s);
		}
	}

	/** A PDF small enough to copy into the reading worker. */
	#readable(s: Source): boolean {
		return s.kind === 'pdf' && (s.bytes?.byteLength ?? 0) <= this.#cfg.maxFileBytes;
	}

	#list(s: Source) {
		this.#listing.set(s.id, 'pending');
		const gen = this.#generation;
		this.#ensure()
			.scannedPages(s)
			.then(
				(pages) => {
					if (this.#listing.get(s.id) !== 'pending') return;
					this.#listing.set(s.id, pages);
					this.#rebuild();
				},
				() => {
					// The worker failed (a stopped one already forgot its listings): ask again once.
					if (gen === this.#generation && this.#listing.get(s.id) === 'pending') this.#listing.set(s.id, []);
					this.#scheduleIdle();
				}
			);
	}

	#rebuild() {
		const all: string[] = [];
		const seen = new Set<string>();
		for (const p of this.#pages) {
			const k = `${p.sourceId}:${p.pageIndex}`;
			if (!seen.has(k)) {
				seen.add(k);
				all.push(k);
			}
		}
		const eligible: string[] = [];
		const sets = new Map<SourceId, Set<number>>();
		for (const [id, l] of this.#listing) if (l !== 'pending') sets.set(id, new Set(l));
		const unlisted = new Set<SourceId>();
		for (const s of this.#sources.values()) if (this.#readable(s) && s.pages.length > this.#cfg.maxDocPages) unlisted.add(s.id);
		for (const p of this.#pages) {
			const k = `${p.sourceId}:${p.pageIndex}`;
			// Redaction boxes: the text under them is not read (the export does not read such pages either).
			if (p.stamps.some((st) => st.kind === 'redact')) continue;
			if (sets.get(p.sourceId)?.has(p.pageIndex) && !eligible.includes(k)) eligible.push(k);
		}
		this.#queue.setDocument({ all, eligible, unlisted });
		this.#changed();
	}

	#changed() {
		this.#changes++;
		this.#schedulePump(0);
	}

	#schedulePump(ms: number) {
		if (this.#pumpTimer !== null) return;
		this.#pumpTimer = this.#setT(() => {
			this.#pumpTimer = null;
			this.#pump();
		}, ms);
	}

	#pump() {
		if (this.#running || this.#held.size) return;
		const key = this.#queue.next();
		if (!key) {
			this.#finishBatch();
			this.#scheduleIdle();
			return;
		}
		const sid = sourceOfKey(key);
		const source = this.#sources.get(sid);
		if (!source) return;
		if (this.#idle !== null) {
			this.#clearT(this.#idle);
			this.#idle = null;
		}
		const pageIndex = Number(key.slice(sid.length + 1));
		this.#queue.start(key);
		this.#running = true;
		this.#startedAt = this.#now();
		this.#changes++;
		const gen = this.#generation;
		this.#ensure()
			.readScanPage(source, pageIndex)
			.then(
				(r) => {
					if (gen !== this.#generation) return;
					if (r.ms > 0) this.#pageMs.push(r.ms);
					if (r.text.words.length) this.#gotWords.add(sid);
					this.#queue.finish(key, { words: r.text.words.length > 0, value: { known: r.reuse, text: Object.freeze(r.text) as PageText }, ms: r.ms });
				},
				(e) => {
					if (gen !== this.#generation) return;
					console.warn('Could not read the text in this scan', e);
					this.#queue.finish(key, { words: false, value: { known: { sourceId: sid, pageIndex, outcome: null }, text: { words: [], skipped: 0 } }, ms: 0 });
				}
			)
			.finally(() => {
				if (gen !== this.#generation) return;
				this.#running = false;
				this.#changes++;
				this.#schedulePump(YIELD_MS);
			});
	}

	#finishBatch() {
		const fresh = [...this.#gotWords].filter((id) => !this.#announced.has(id) && this.#sources.has(id));
		this.#gotWords.clear();
		if (!fresh.length) return;
		for (const id of fresh) this.#announced.add(id);
		this.#notify(fresh.every((id) => this.#queue.allRead(id)) ? DONE_NOTICE : DONE_FIRST_NOTICE);
	}

	#scheduleIdle() {
		if (this.#idle !== null || !this.#engine) return;
		this.#idle = this.#setT(() => {
			this.#idle = null;
			if (!this.#running && !this.#queue.busy && ![...this.#listing.values()].includes('pending')) this.#stopEngine();
		}, IDLE_MS);
	}

	#ensure(): EngineClient {
		this.#engine ??= this.#make();
		return this.#engine;
	}

	#stopEngine() {
		if (this.#queue.reading) this.#queue.cancel();
		this.#generation++;
		this.#running = false;
		for (const [id, l] of [...this.#listing]) if (l === 'pending') this.#listing.delete(id);
		const e = this.#engine;
		this.#engine = null;
		e?.terminate();
		this.#changes++;
		// Files still open whose listing was lost with the worker are listed again (only when there is work).
		if (this.#pages.length) this.#listMissing();
	}
}

let shared: ScanReader | null = null;

/** The app's one reader (the workspace feeds it, the editor reads from it). */
export function scanReader(): ScanReader {
	if (!shared) {
		shared = new ScanReader();
		if (typeof document !== 'undefined') {
			const onVis = () => shared?.hold('hidden', document.visibilityState === 'hidden');
			document.addEventListener('visibilitychange', onVis);
			onVis();
		}
	}
	return shared;
}
