/**
 * Where saved work lives: IndexedDB on this device, database "pdf-workspace-session"
 * (version 2, "Home and projects", 2026-11-14), object stores:
 *  - `projects`: one record per piece of saved work, keyed by its project id (format.ts), a few KB each;
 *  - `thumbs`:   a small JPEG of each project's first page, keyed by project id;
 *  - `blobs`:    `{ hash, size, blob, at }`, one per source file and asset, keyed by the
 *    SHA-256 of the bytes, so a file is written once and shared by every project that uses it;
 *  - `session`:  version 1's single record (key "current"), read once to move it into
 *    `projects` (takeLegacy) and otherwise left empty.
 * Opening version 2 closes any tab still running the version 1 build (its `onversionchange`),
 * so an old tab can never sweep blobs that only the new projects use.
 * Nothing here touches the network. `memoryStorage` is the same contract in memory
 * for unit tests.
 */

export class StorageFullError extends Error {
	constructor(message = 'Not enough room on this device') {
		super(message);
		this.name = 'StorageFullError';
	}
}

/** What a guarded record write found. */
export type PutResult = 'ok' | 'conflict' | 'missing-blob';

export interface SessionStorage {
	/** Every stored project record, untyped (format.ts parses them). */
	listRecords(): Promise<{ id: string; raw: unknown }[]>;
	getRecord(id: string): Promise<unknown>;
	/**
	 * Write a project's record in one transaction, only if `allow(current)` says so and
	 * every hash in `needs` is stored. Otherwise nothing is written.
	 */
	putRecord(id: string, record: unknown, allow: (current: unknown) => boolean, needs: readonly string[]): Promise<PutResult>;
	/** Delete a project's record and its thumbnail. */
	deleteRecord(id: string): Promise<void>;
	/** Every stored thumbnail, by project id. */
	getThumbs(): Promise<Map<string, Blob>>;
	putThumb(id: string, thumb: Blob): Promise<void>;
	/** Move version 1's single saved record (if any) to project `id`. True when there was one. */
	takeLegacy(id: string): Promise<boolean>;
	hasBlob(hash: string): Promise<boolean>;
	/** Throws StorageFullError when the browser refuses for lack of room. `at`: when (ms, the session's clock). */
	putBlob(hash: string, bytes: Uint8Array, at: number): Promise<void>;
	getBlob(hash: string): Promise<Uint8Array | null>;
	deleteBlobs(hashes: readonly string[]): Promise<void>;
	/**
	 * In one transaction: delete every blob that no stored record names (`hashesOf`),
	 * that is not in `keep`, and that was written before `writtenBefore` (so a file
	 * another tab has just stored for work it has not saved yet is left alone) or is in
	 * `mine` (files the calling tab wrote itself and no longer uses).
	 */
	sweep(keep: ReadonlySet<string>, hashesOf: (raw: unknown) => string[], writtenBefore: number, mine?: ReadonlySet<string>): Promise<number>;
	/** Delete every record, thumbnail and blob. */
	clear(): Promise<void>;
}

const DB = 'pdf-workspace-session';
const VERSION = 2;
const LEGACY = 'session';
const LEGACY_KEY = 'current';
const PROJECTS = 'projects';
const THUMBS = 'thumbs';
const BLOBS = 'blobs';

function isQuota(e: unknown): boolean {
	const name = (e as { name?: string } | null)?.name;
	return name === 'QuotaExceededError' || name === 'NS_ERROR_DOM_QUOTA_REACHED';
}

function req<T>(r: IDBRequest<T>): Promise<T> {
	return new Promise((resolve, reject) => {
		r.onsuccess = () => resolve(r.result);
		r.onerror = () => reject(r.error);
	});
}

function done(tx: IDBTransaction): Promise<void> {
	return new Promise((resolve, reject) => {
		tx.oncomplete = () => resolve();
		tx.onerror = () => reject(isQuota(tx.error) ? new StorageFullError() : tx.error);
		tx.onabort = () => reject(isQuota(tx.error) ? new StorageFullError() : (tx.error ?? new Error('aborted')));
	});
}

/** Open the database. Rejects when storage is unavailable (blocked, private mode quirks, no IndexedDB). */
export function openIdbStorage(): Promise<SessionStorage> {
	return new Promise<IDBDatabase>((resolve, reject) => {
		let r: IDBOpenDBRequest;
		try {
			if (typeof indexedDB === 'undefined' || !indexedDB) return reject(new Error('IndexedDB is not available'));
			r = indexedDB.open(DB, VERSION);
		} catch (e) {
			return reject(e);
		}
		r.onupgradeneeded = () => {
			const db = r.result;
			if (!db.objectStoreNames.contains(LEGACY)) db.createObjectStore(LEGACY);
			if (!db.objectStoreNames.contains(BLOBS)) db.createObjectStore(BLOBS, { keyPath: 'hash' });
			if (!db.objectStoreNames.contains(PROJECTS)) db.createObjectStore(PROJECTS);
			if (!db.objectStoreNames.contains(THUMBS)) db.createObjectStore(THUMBS);
		};
		r.onsuccess = () => resolve(r.result);
		r.onerror = () => reject(r.error ?? new Error('IndexedDB did not open'));
		r.onblocked = () => reject(new Error('IndexedDB is blocked'));
	}).then((db) => {
		// Another tab of a newer build asking to upgrade: let it.
		db.onversionchange = () => db.close();
		return idb(db);
	});
}

function idb(db: IDBDatabase): SessionStorage {
	const tx = (stores: string | string[], mode: IDBTransactionMode) => db.transaction(stores, mode);
	return {
		async listRecords() {
			const t = tx(PROJECTS, 'readonly');
			const s = t.objectStore(PROJECTS);
			const [keys, values] = await Promise.all([req(s.getAllKeys()), req(s.getAll())]);
			return keys.map((k, i) => ({ id: String(k), raw: values[i] }));
		},
		async getRecord(id) {
			return req(tx(PROJECTS, 'readonly').objectStore(PROJECTS).get(id));
		},
		async putRecord(id, record, allow, needs) {
			const t = tx([PROJECTS, BLOBS], 'readwrite');
			const finished = done(t);
			let result: PutResult = 'ok';
			try {
				const current = await req(t.objectStore(PROJECTS).get(id));
				if (!allow(current)) result = 'conflict';
				else {
					const blobs = t.objectStore(BLOBS);
					const counts = await Promise.all(needs.map((h) => req(blobs.count(h))));
					if (counts.some((c) => c === 0)) result = 'missing-blob';
					else t.objectStore(PROJECTS).put(record, id);
				}
				if (result !== 'ok') t.abort();
			} catch (e) {
				try {
					t.abort();
				} catch {
					// Already finished.
				}
				await finished.catch(() => undefined);
				throw isQuota(e) ? new StorageFullError() : e;
			}
			if (result !== 'ok') {
				await finished.catch(() => undefined);
				return result;
			}
			await finished;
			return 'ok';
		},
		async deleteRecord(id) {
			const t = tx([PROJECTS, THUMBS], 'readwrite');
			t.objectStore(PROJECTS).delete(id);
			t.objectStore(THUMBS).delete(id);
			await done(t);
		},
		async getThumbs() {
			const t = tx(THUMBS, 'readonly');
			const s = t.objectStore(THUMBS);
			const [keys, values] = await Promise.all([req(s.getAllKeys()), req(s.getAll())]);
			const out = new Map<string, Blob>();
			keys.forEach((k, i) => {
				const v = values[i] as { blob?: unknown } | undefined;
				if (v?.blob instanceof Blob) out.set(String(k), v.blob);
			});
			return out;
		},
		async putThumb(id, thumb) {
			// Only for work that is still saved: a thumbnail never brings a forgotten project back.
			const t = tx([PROJECTS, THUMBS], 'readwrite');
			const finished = done(t);
			const n = await req(t.objectStore(PROJECTS).count(id));
			if (n > 0) t.objectStore(THUMBS).put({ blob: thumb }, id);
			await finished;
		},
		async takeLegacy(id) {
			const t = tx([LEGACY, PROJECTS], 'readwrite');
			const finished = done(t);
			const raw = await req(t.objectStore(LEGACY).get(LEGACY_KEY));
			if (raw !== undefined) {
				t.objectStore(PROJECTS).put(raw, id);
				t.objectStore(LEGACY).delete(LEGACY_KEY);
			}
			await finished;
			return raw !== undefined;
		},
		async hasBlob(hash) {
			return (await req(tx(BLOBS, 'readonly').objectStore(BLOBS).count(hash))) > 0;
		},
		async putBlob(hash, bytes, at) {
			const t = tx(BLOBS, 'readwrite');
			try {
				t.objectStore(BLOBS).put({ hash, size: bytes.length, blob: new Blob([bytes as BlobPart]), at });
			} catch (e) {
				throw isQuota(e) ? new StorageFullError() : e;
			}
			await done(t);
		},
		async getBlob(hash) {
			const row = (await req(tx(BLOBS, 'readonly').objectStore(BLOBS).get(hash))) as { blob?: Blob } | undefined;
			if (!row?.blob) return null;
			return new Uint8Array(await row.blob.arrayBuffer());
		},
		async deleteBlobs(hashes) {
			if (!hashes.length) return;
			const t = tx(BLOBS, 'readwrite');
			const s = t.objectStore(BLOBS);
			for (const h of hashes) s.delete(h);
			await done(t);
		},
		async sweep(keep, hashesOf, writtenBefore, mine) {
			const t = tx([PROJECTS, LEGACY, BLOBS], 'readwrite');
			const finished = done(t);
			const live = new Set(keep);
			for (const raw of await req(t.objectStore(PROJECTS).getAll())) for (const h of hashesOf(raw)) live.add(h);
			const legacy = await req(t.objectStore(LEGACY).get(LEGACY_KEY));
			if (legacy !== undefined) for (const h of hashesOf(legacy)) live.add(h);
			let n = 0;
			await new Promise<void>((resolve, reject) => {
				const c = t.objectStore(BLOBS).openCursor();
				c.onerror = () => reject(c.error);
				c.onsuccess = () => {
					const cur = c.result;
					if (!cur) return resolve();
					const row = cur.value as { hash: string; at?: number };
					if (!live.has(row.hash) && ((row.at ?? 0) < writtenBefore || mine?.has(row.hash))) {
						cur.delete();
						n++;
					}
					cur.continue();
				};
			});
			await finished;
			return n;
		},
		async clear() {
			const t = tx([LEGACY, PROJECTS, THUMBS, BLOBS], 'readwrite');
			for (const s of [LEGACY, PROJECTS, THUMBS, BLOBS]) t.objectStore(s).clear();
			await done(t);
		}
	};
}

/** In-memory storage with the same contract (tests). `quotaBytes` simulates a full device. */
export function memoryStorage(opts: { quotaBytes?: number } = {}) {
	let legacy: unknown = undefined;
	const records = new Map<string, unknown>();
	const thumbs = new Map<string, Blob>();
	const blobs = new Map<string, Uint8Array>();
	const written = new Map<string, number>();
	const used = () => [...blobs.values()].reduce((n, b) => n + b.length, 0);
	const store: SessionStorage & {
		blobs: Map<string, Uint8Array>;
		records: Map<string, unknown>;
		thumbs: Map<string, Blob>;
		quotaBytes: number | undefined;
		/** The only (or first) record, for tests with one piece of work. */
		raw: () => unknown;
		setRaw: (v: unknown, id?: string) => void;
		setLegacy: (v: unknown) => void;
		legacy: () => unknown;
	} = {
		blobs,
		records,
		thumbs,
		quotaBytes: opts.quotaBytes,
		raw: () => {
			const first = [...records.values()][0];
			return first === undefined ? undefined : structuredClone(first);
		},
		setRaw: (v, id) => records.set(id ?? [...records.keys()][0] ?? 'p1', structuredClone(v)),
		setLegacy: (v) => (legacy = structuredClone(v)),
		legacy: () => legacy,
		async listRecords() {
			return [...records].map(([id, raw]) => ({ id, raw: structuredClone(raw) }));
		},
		async getRecord(id) {
			const r = records.get(id);
			return r === undefined ? undefined : structuredClone(r);
		},
		async putRecord(id, rec, allow, needs) {
			const cur = records.get(id);
			if (!allow(cur === undefined ? undefined : structuredClone(cur))) return 'conflict';
			if (needs.some((h) => !blobs.has(h))) return 'missing-blob';
			records.set(id, structuredClone(rec));
			return 'ok';
		},
		async deleteRecord(id) {
			records.delete(id);
			thumbs.delete(id);
		},
		async getThumbs() {
			return new Map(thumbs);
		},
		async putThumb(id, thumb) {
			if (records.has(id)) thumbs.set(id, thumb);
		},
		async takeLegacy(id) {
			if (legacy === undefined) return false;
			records.set(id, legacy);
			legacy = undefined;
			return true;
		},
		async hasBlob(hash) {
			return blobs.has(hash);
		},
		async putBlob(hash, bytes, at) {
			if (store.quotaBytes !== undefined && used() + bytes.length > store.quotaBytes) throw new StorageFullError();
			blobs.set(hash, bytes.slice());
			written.set(hash, at);
		},
		async getBlob(hash) {
			return blobs.get(hash)?.slice() ?? null;
		},
		async deleteBlobs(hashes) {
			for (const h of hashes) blobs.delete(h);
		},
		async sweep(keep, hashesOf, writtenBefore, mine) {
			const live = new Set(keep);
			for (const raw of records.values()) for (const h of hashesOf(raw)) live.add(h);
			if (legacy !== undefined) for (const h of hashesOf(legacy)) live.add(h);
			let n = 0;
			for (const h of [...blobs.keys()]) {
				if (!live.has(h) && ((written.get(h) ?? 0) < writtenBefore || mine?.has(h))) {
					blobs.delete(h);
					n++;
				}
			}
			return n;
		},
		async clear() {
			legacy = undefined;
			records.clear();
			thumbs.clear();
			blobs.clear();
		}
	};
	return store;
}
