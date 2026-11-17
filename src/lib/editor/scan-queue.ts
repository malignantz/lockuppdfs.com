/**
 * Which scanned page the background reader (scan-reader.svelte.ts) reads next, and how
 * long the wait is. Pure: no engine, no timers, no DOM, so it is unit-tested alone.
 *
 * Pages are keys `sourceId:pageIndex` (a source page used twice in the document is read
 * once). The document gives its qualifying pages in document order (`setDocument`);
 * which of them are read depends on the measured cost (about 6 s of one core a page on a
 * desktop, see the plan):
 *
 *  - a document of at most `autoAll` qualifying pages is read whole, as soon as it is
 *    added;
 *  - a longer one: its first `autoFirst` qualifying pages, then, while the editor is
 *    open, the page being viewed and the `ahead` qualifying pages after it, following the
 *    person as they move (pages read stay read);
 *  - a very long file (more than `maxDocPages` pages, so its qualifying pages are not
 *    listed in advance): only the page being viewed, on demand.
 *
 * Order: the page being viewed first, then the pages after it in its window, then the
 * rest in document order. Results of pages no longer in the document are dropped, at
 * most `keep` results are kept (the oldest that are not being viewed go first; such a
 * page is read again if it is wanted again).
 */

export interface QueueConfig {
	autoAll: number;
	autoFirst: number;
	ahead: number;
	maxDocPages: number;
	keep: number;
}

export const QUEUE_CONFIG: QueueConfig = { autoAll: 10, autoFirst: 3, ahead: 2, maxDocPages: 300, keep: 200 };

export interface PageResult<T> {
	/** The page's words were found (false: no words, or the reading failed). */
	words: boolean;
	value: T;
	ms: number;
}

export type PageState = 'none' | 'waiting' | 'reading' | 'done';

export interface DocumentPages {
	/** Qualifying pages (keys) of the files that were listed, in document order. */
	eligible: string[];
	/** Files too long to list (source ids): their pages are read only when viewed. */
	unlisted: ReadonlySet<string>;
	/** Every page key of the document in document order (to find the pages after the viewed one). */
	all: string[];
}

/** The source id of a key `sourceId:pageIndex`. */
export const sourceOfKey = (key: string) => key.slice(0, key.lastIndexOf(':'));

export class ScanQueue<T> {
	private eligible: string[] = [];
	private eligibleSet = new Set<string>();
	private unlisted: ReadonlySet<string> = new Set();
	private all: string[] = [];
	private viewed: string | null = null;
	/** Pages wanted because the person viewed them or a page before them (windows). */
	private asked = new Set<string>();
	/** Keys the very long document's viewer asked for that are not known to qualify yet. */
	private onDemand = new Set<string>();
	private results = new Map<string, PageResult<T>>();
	/** Results dropped for room: not read again until the person views the page again. */
	private evicted = new Set<string>();
	private inFlight: string | null = null;
	/** Pages finished since the queue was last idle, and how many were wanted then. */
	private batchDone = 0;
	private batchKeys = new Set<string>();

	constructor(private readonly cfg: QueueConfig = QUEUE_CONFIG) {}

	/** The document's pages changed (added, removed, reordered, a source gone). */
	setDocument(doc: DocumentPages): void {
		this.all = doc.all;
		this.unlisted = doc.unlisted;
		this.eligible = doc.eligible;
		this.eligibleSet = new Set(this.eligible);
		const present = new Set(doc.all);
		for (const k of [...this.results.keys()]) if (!present.has(k)) this.results.delete(k);
		for (const k of [...this.asked]) if (!present.has(k)) this.asked.delete(k);
		for (const k of [...this.onDemand]) if (!present.has(k)) this.onDemand.delete(k);
		for (const k of [...this.batchKeys]) if (!present.has(k)) this.batchKeys.delete(k);
		for (const k of [...this.evicted]) if (!present.has(k)) this.evicted.delete(k);
		if (this.viewed && !present.has(this.viewed)) this.viewed = null;
	}

	/** The page the editor shows (null: the editor is closed). */
	view(key: string | null): void {
		this.viewed = key;
		if (!key) return;
		this.evicted.delete(key);
		if (this.unlisted.has(sourceOfKey(key))) {
			this.onDemand.add(key);
			return;
		}
		if (this.eligible.length <= this.cfg.autoAll) return;
		const i = this.all.indexOf(key);
		if (i < 0) return;
		if (this.eligibleSet.has(key)) this.asked.add(key);
		for (const k of this.after(i)) this.asked.add(k);
	}

	/** The `ahead` qualifying pages after document position `i`. */
	private after(i: number): string[] {
		const out: string[] = [];
		for (let j = i + 1; i >= 0 && j < this.all.length && out.length < this.cfg.ahead; j++) {
			const k = this.all[j];
			if (this.eligibleSet.has(k) && k !== this.all[i] && !out.includes(k)) out.push(k);
		}
		return out;
	}

	/** Pages to be read, in the order they will be read (the one in flight excluded). */
	order(): string[] {
		const wanted = this.wanted();
		const out: string[] = [];
		const push = (k: string) => {
			if (wanted.has(k) && !this.results.has(k) && !this.evicted.has(k) && k !== this.inFlight && !out.includes(k)) out.push(k);
		};
		if (this.viewed) push(this.viewed);
		if (this.viewed && this.eligibleSet.has(this.viewed)) for (const k of this.after(this.all.indexOf(this.viewed))) push(k);
		for (const k of this.onDemand) push(k);
		for (const k of this.eligible) push(k);
		return out;
	}

	/** The next page to read, or null. Does not start it. */
	next(): string | null {
		if (this.inFlight) return null;
		return this.order()[0] ?? null;
	}

	start(key: string): void {
		this.inFlight = key;
		if (this.batchKeys.size === 0) this.batchDone = 0;
		for (const k of this.order()) this.batchKeys.add(k);
		this.batchKeys.add(key);
	}

	/** The page in flight finished (a reading that failed is a result without words: it is not tried again). */
	finish(key: string, result: PageResult<T>): void {
		if (this.inFlight === key) this.inFlight = null;
		if (this.all.includes(key)) {
			this.results.set(key, result);
			this.trim();
		}
		if (this.batchKeys.has(key)) this.batchDone++;
		if (!this.next()) {
			this.batchKeys.clear();
			this.batchDone = 0;
		}
	}

	/** True while pages are left to read (in flight or waiting). */
	get busy(): boolean {
		return this.inFlight !== null || this.order().length > 0;
	}

	/** The page in flight was dropped (its source went away): no result. */
	cancel(): void {
		if (this.inFlight) this.batchKeys.delete(this.inFlight);
		this.inFlight = null;
	}

	get reading(): string | null {
		return this.inFlight;
	}

	result(key: string): PageResult<T> | undefined {
		return this.results.get(key);
	}

	state(key: string): PageState {
		if (this.results.has(key)) return 'done';
		if (key === this.inFlight) return 'reading';
		return this.wanted().has(key) && !this.evicted.has(key) ? 'waiting' : 'none';
	}

	/** Every result kept, for an export to reuse. */
	values(): T[] {
		return [...this.results.values()].map((r) => r.value);
	}

	/** Pages of the current batch read so far, of how many (the batch ends when nothing is left to read). */
	progress(): { done: number; total: number } {
		const left = this.order().length + (this.inFlight ? 1 : 0);
		const total = Math.max(this.batchKeys.size, this.batchDone + left);
		return { done: Math.min(this.batchDone, total), total };
	}

	/** Pages to read before `key` has its words, counting the one in flight; null when it is not wanted. */
	pagesUntil(key: string): number | null {
		if (this.results.has(key)) return 0;
		if (key === this.inFlight) return 1;
		const i = this.order().indexOf(key);
		if (i < 0) return null;
		return i + 1 + (this.inFlight ? 1 : 0);
	}

	private wanted(): Set<string> {
		const out = new Set(this.onDemand);
		if (this.eligible.length <= this.cfg.autoAll) {
			for (const k of this.eligible) out.add(k);
			return out;
		}
		for (const k of this.eligible.slice(0, this.cfg.autoFirst)) out.add(k);
		for (const k of this.asked) if (this.eligibleSet.has(k)) out.add(k);
		return out;
	}

	private trim() {
		while (this.results.size > this.cfg.keep) {
			const old = [...this.results.keys()].find((k) => k !== this.viewed);
			if (!old) return;
			this.results.delete(old);
			// Not read again until the person comes back to it.
			this.evicted.add(old);
			this.asked.delete(old);
			this.onDemand.delete(old);
		}
	}
}

/**
 * Time until a page has its words, from measured page times: null before any page was
 * measured (nothing is guessed). `pagesBefore` counts pages to read including the page
 * itself and the one in flight; `elapsedMs` is how long the one in flight has run.
 */
export function waitEstimate(pageMs: readonly number[], pagesBefore: number, elapsedMs: number, inFlight: boolean): number | null {
	if (!pageMs.length || pagesBefore <= 0) return pagesBefore <= 0 ? 0 : null;
	// The median of the last few pages: one slow page (the engine loading) does not swing it.
	const recent = [...pageMs.slice(-5)].sort((a, b) => a - b);
	const per = recent[Math.floor(recent.length / 2)];
	const current = inFlight ? Math.max(0, per - elapsedMs) : per;
	return current + per * (pagesBefore - 1);
}

/** The expected wait before any measurement (the plan's desktop figure: about 6 s a page). */
export const PRIOR_PAGE_MS = 6000;
/** A wait longer than this shows the progress bar. */
export const BAR_AFTER_MS = 5000;
