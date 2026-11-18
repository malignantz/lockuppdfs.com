/**
 * The OCR cache: no scanned page is read twice. A page's reading (Engine.readScanPage's
 * `reuse`, ExportResult.ocrRead: the engine's opaque outcome, accepted or declined with
 * its reason, never a picture) is kept per source page, keyed by
 *
 *     (SHA-256 of the source file's bytes, page index, OCR pipeline version)
 *
 * The engine reads the source page as it came (stage.ts renderForOcr: the page as the
 * file shows it, never the person's turns, crops or marks), so editing a page never makes
 * its reading stale; only other bytes (another file) miss. The version is the engine's
 * OCR_PIPELINE_VERSION (checked by a test); the engine also refuses a reading of another
 * version, so a kept reading can never outlive a pipeline change.
 *
 * Two layers: memory for the visit (at most MEMORY_PAGES pages, the oldest go first), and,
 * when work is saved on this device, the session database's `ocr` store
 * (session/storage.ts), written only for a file that is stored and deleted with it. A
 * reading made before its file is stored is kept in memory and written once the file is.
 *
 * Users: the editor's background reader (editor/scan-reader.svelte.ts) asks here before
 * reading and adds what it reads; the export passes what is known as ExportOptions.ocrKnown
 * and adds ExportResult.ocrRead. A kept reading only saves the reading: the layer, its
 * checks and the final check run on it exactly as on a fresh one.
 */
import type { OcrKnownPage, PageRef, Source, SourceId } from '../core/types';
import type { OcrRow, SessionStorage } from '../session/storage';

/** The engine's OCR_PIPELINE_VERSION (ocr/stage.ts; not imported: the workspace stays engine-free; checked by a test). */
export const OCR_READ_VERSION = 1;
/** Most pages kept in memory. */
export const MEMORY_PAGES = 3000;

export type OcrCacheStore = Pick<SessionStorage, 'getOcr' | 'putOcr'>;

export interface OcrCacheOptions {
	/** Where readings are kept with saved work, or null when work is not saved. */
	store?: () => OcrCacheStore | null;
	hash?: (bytes: Uint8Array) => Promise<string>;
	now?: () => number;
	/** Wait before trying again to write readings whose file is not stored yet. */
	retryMs?: number;
	setTimeout?: (fn: () => void, ms: number) => unknown;
}

async function sha256(bytes: Uint8Array): Promise<string> {
	const d = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes as BufferSource));
	let s = '';
	for (const b of d) s += b.toString(16).padStart(2, '0');
	return s;
}

const RETRIES = 20;

export class OcrCache {
	#store: () => OcrCacheStore | null;
	readonly #hash: (bytes: Uint8Array) => Promise<string>;
	readonly #now: () => number;
	readonly #retryMs: number;
	readonly #setT: (fn: () => void, ms: number) => unknown;
	/** Memory: `${hash}:${pageIndex}` → outcome, oldest first. */
	#mem = new Map<string, unknown>();
	#hashes = new Map<SourceId, Promise<string | null>>();
	#loaded = new Map<string, Promise<void>>();
	/** Readings not written to the store yet, by file hash. */
	#pending = new Map<string, Map<number, unknown>>();
	#tries = new Map<string, number>();
	#timer: unknown = null;
	#listeners = new Set<() => void>();

	constructor(opts: OcrCacheOptions = {}) {
		this.#store = opts.store ?? (() => null);
		this.#hash = opts.hash ?? sha256;
		this.#now = opts.now ?? (() => Date.now());
		this.#retryMs = opts.retryMs ?? 5000;
		this.#setT = opts.setTimeout ?? ((fn, ms) => setTimeout(fn, ms));
	}

	/** Where to keep readings with saved work (the session sets it once it exists). */
	useStore(store: () => OcrCacheStore | null): void {
		this.#store = store;
		this.#loaded.clear();
		void this.flush();
	}

	/** Called when readings were added (the editor's reader looks again). */
	onChange(fn: () => void): () => void {
		this.#listeners.add(fn);
		return () => void this.#listeners.delete(fn);
	}

	/** The file's hash: PDF sources with their bytes only. */
	hashOf(source: Source): Promise<string | null> {
		let p = this.#hashes.get(source.id);
		if (!p) {
			p = source.kind === 'pdf' && source.bytes instanceof Uint8Array ? this.#hash(source.bytes).catch(() => null) : Promise.resolve(null);
			this.#hashes.set(source.id, p);
		}
		return p;
	}

	/** A kept reading of page `pageIndex` of `source`, or null. */
	async get(source: Source, pageIndex: number): Promise<OcrKnownPage | null> {
		const h = await this.hashOf(source);
		if (!h) return null;
		await this.#load(h);
		const key = `${h}:${pageIndex}`;
		return this.#mem.has(key) ? { sourceId: source.id, pageIndex, outcome: this.#mem.get(key), version: OCR_READ_VERSION } : null;
	}

	/** Kept readings of the source pages `pages` use (each source page once), for ExportOptions.ocrKnown. */
	async knownFor(sources: readonly Source[], pages: readonly Pick<PageRef, 'sourceId' | 'pageIndex'>[]): Promise<OcrKnownPage[]> {
		const byId = new Map(sources.map((s) => [s.id, s]));
		const seen = new Set<string>();
		const out: OcrKnownPage[] = [];
		for (const p of pages) {
			const k = `${p.sourceId}:${p.pageIndex}`;
			const s = byId.get(p.sourceId);
			if (seen.has(k) || !s) continue;
			seen.add(k);
			const known = await this.get(s, p.pageIndex);
			if (known) out.push(known);
		}
		return out;
	}

	/** Keeps readings of `source`'s pages. Only readings stamped with the current version are kept (a failed reading has none). */
	async add(source: Source, readings: readonly OcrKnownPage[]): Promise<void> {
		const fresh = readings.filter((r) => r && r.sourceId === source.id && r.version === OCR_READ_VERSION && Number.isInteger(r.pageIndex) && r.pageIndex >= 0);
		if (!fresh.length) return;
		const h = await this.hashOf(source);
		if (!h) return;
		const pend = this.#pending.get(h) ?? new Map<number, unknown>();
		for (const r of fresh) {
			const key = `${h}:${r.pageIndex}`;
			this.#mem.delete(key);
			this.#mem.set(key, r.outcome);
			pend.set(r.pageIndex, r.outcome);
		}
		while (this.#mem.size > MEMORY_PAGES) this.#mem.delete(this.#mem.keys().next().value!);
		this.#pending.set(h, pend);
		this.#tries.set(h, 0);
		for (const fn of [...this.#listeners]) fn();
		await this.flush();
	}

	/** Readings of several sources (an export's ExportResult.ocrRead), matched by source id. */
	async addAll(sources: readonly Source[], readings: readonly OcrKnownPage[] | undefined): Promise<void> {
		if (!readings?.length) return;
		for (const s of sources) {
			const mine = readings.filter((r) => r.sourceId === s.id);
			if (mine.length) await this.add(s, mine);
		}
	}

	/** Writes readings not stored yet; those whose file is not stored yet are tried again later. */
	async flush(): Promise<void> {
		const store = this.#store();
		if (!store || !this.#pending.size) return;
		for (const [h, rows] of [...this.#pending]) {
			const list: OcrRow[] = [...rows].map(([pageIndex, outcome]) => ({ pageIndex, outcome }));
			let ok = false;
			try {
				ok = await store.putOcr(h, OCR_READ_VERSION, list, this.#now());
			} catch {
				// No room, or the database went away: kept in memory only.
			}
			if (ok) {
				// Only what was written (more may have come in meanwhile).
				for (const r of list) if (rows.get(r.pageIndex) === r.outcome) rows.delete(r.pageIndex);
				if (!rows.size) this.#pending.delete(h);
			} else {
				const n = (this.#tries.get(h) ?? 0) + 1;
				this.#tries.set(h, n);
				if (n >= RETRIES) this.#pending.delete(h);
			}
		}
		if (this.#pending.size && this.#timer === null)
			this.#timer = this.#setT(() => {
				this.#timer = null;
				void this.flush();
			}, this.#retryMs);
	}

	/** Pages kept in memory (tests, measurements). */
	get size(): number {
		return this.#mem.size;
	}

	/** Brings a stored file's readings into memory, once per visit. */
	#load(h: string): Promise<void> {
		let p = this.#loaded.get(h);
		if (!p) {
			const store = this.#store();
			p = store
				? store.getOcr(h, OCR_READ_VERSION).then(
						(rows) => {
							for (const r of rows) {
								const key = `${h}:${r.pageIndex}`;
								if (!this.#mem.has(key)) this.#mem.set(key, r.outcome);
							}
							while (this.#mem.size > MEMORY_PAGES) this.#mem.delete(this.#mem.keys().next().value!);
						},
						() => undefined
					)
				: Promise.resolve();
			if (store) this.#loaded.set(h, p);
		}
		return p;
	}
}

let shared: OcrCache | null = null;

/** The app's one cache (the session gives it its store; the editor's reader and the export use it). */
export function ocrCache(): OcrCache {
	shared ??= new OcrCache();
	return shared;
}
