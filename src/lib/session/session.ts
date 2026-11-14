/**
 * Saved work ("Home and projects", 2026-11-14): several pieces of work kept on this
 * device, one open at a time. Framework-free; `index.svelte.ts` is the Svelte view.
 *
 * - The open work is one project. Its record (format.ts) is saved, debounced, under
 *   its project id; a new project gets its id at its first save. Each source's bytes are
 *   stored once, keyed by SHA-256, when the file is opened (`noteOpened`), or on the first
 *   save for sources made another way (blank pages), and shared by every project.
 *   Password-protected files are stored exactly as given, still encrypted; the password
 *   is asked again when the work is opened and is never stored.
 * - Home lists every saved project (`cards`), the open one first. Opening another one
 *   (`open`) needs an empty workspace: the caller saves (`flush`), then `close`s the
 *   open work, which unloads it. Opening is never automatic, all-or-nothing and verified
 *   (schema, every blob present with its hash, the state parses and DocStore accepts it).
 * - Two tabs: a tab holds a lock on the project it has open (`deps.lock`); another tab
 *   shows that card as open elsewhere and cannot open or forget it. Every record write
 *   also checks, in its transaction, that the stored record is this tab's own or the
 *   exact one it opened, so no tab overwrites another's work even without locks.
 * - Limits: at most `maxProjects` saved, at most `maxTotalBytes` stored, and the
 *   browser's own quota. Nothing is ever deleted to make room: the state says why the
 *   work is not saved and the UI offers to forget older work.
 * - Anything that fails (no storage, no room, the switch off) leaves the app working as
 *   before, with `state` saying why nothing is saved.
 */
import type { Engine, Source, SourceId } from '../core/types';
import type { DocState, DocStore } from '../doc/store';
import { EngineError } from '../engine/errors';
import {
	SessionFormatError,
	buildRecord,
	hashesOf,
	isExpired,
	parseRecord,
	projectName,
	summarizeProject,
	type ProjectSummary,
	type SavedExportForm,
	type SavedSource,
	type SessionRecord
} from './format';
import { StorageFullError, type SessionStorage } from './storage';

export type SaveState =
	/** Opening the storage. */
	| 'starting'
	/** This work is stored (or there is nothing to store). */
	| 'saved'
	/** "Keep my work on this device" is off. */
	| 'off'
	/** Another tab changed or opened this work since this tab opened it. */
	| 'other-tab'
	/** No usable storage (blocked, private mode, no IndexedDB or no crypto). */
	| 'unavailable'
	/** Not enough room on this device. */
	| 'full'
	/** As many pieces of work as are kept are saved already. */
	| 'limit'
	/** A file is too large to keep. */
	| 'too-large'
	/** The user chose to forget what is open (in another tab). */
	| 'forgotten'
	/** A write failed for another reason. */
	| 'failed';

export interface PasswordAsk {
	name: string;
	error?: string;
}

export type OpenResult =
	| { ok: true; skipped: number }
	/** Every file was skipped at its password: nothing opened, the work stays saved. */
	| { ok: false; reason: 'skipped' }
	/** The saved work failed a check and was deleted. */
	| { ok: false; reason: 'broken' }
	/** It is open in another tab. */
	| { ok: false; reason: 'elsewhere' }
	/** It is no longer stored, or the workspace is not empty. */
	| { ok: false; reason: 'unavailable' };

/** One card on Home. */
export interface ProjectCard extends ProjectSummary {
	id: string;
	/** The work open in this tab now. */
	open: boolean;
	/** Stored on this device (false: kept in this tab only, until it is closed). */
	saved: boolean;
	/** Open in another tab: it cannot be opened or forgotten here. */
	elsewhere: boolean;
	/** A small picture of the first page (JPEG), when there is one. */
	thumb: Blob | null;
}

export interface ProjectLock {
	release(): void;
}

export interface SessionDeps {
	store: DocStore;
	engine: Pick<Engine, 'openPdf'>;
	openStorage: () => Promise<SessionStorage>;
	/** Hold project `id` for this tab; null when another tab holds it. Without it, no locks. */
	lock?: (id: string) => Promise<ProjectLock | null>;
	/** Projects other tabs hold now. */
	heldElsewhere?: () => Promise<ReadonlySet<string>>;
	/** A small JPEG of the first page as shown, or null. */
	thumbnail?: (state: DocState) => Promise<Blob | null>;
	/** The remembered switch. */
	prefs: { get(): boolean; set(on: boolean): void };
	/** The export dialog's options (never the password). */
	exportForm: { get(): SavedExportForm; set(form: SavedExportForm): void };
	app: string;
	now?: () => number;
	hash?: (bytes: Uint8Array) => Promise<string>;
	/** navigator.storage.estimate, when there is one. */
	estimate?: () => Promise<{ quota?: number; usage?: number } | undefined>;
	/** Tell other tabs (and hear them): 'forgot', 'off', 'on', 'changed'. */
	channel?: { post(msg: string): void; listen(fn: (msg: string) => void): void };
	notify?: (message: string, tone?: 'info' | 'error') => void;
	debounceMs?: number;
	maxWaitMs?: number;
	/** How long an emptied workspace waits before its saved copy is deleted (Start over's undo window). */
	emptyGraceMs?: number;
	/** Files larger than this are not kept. */
	maxFileBytes?: number;
	/** At most this many pieces of work are kept. */
	maxProjects?: number;
	/** At most this many bytes are stored for all of them together. */
	maxTotalBytes?: number;
	/** A stored file no record names is left alone this long (another tab may be about to save it). */
	sweepGraceMs?: number;
	writerId?: string;
	newId?: () => string;
	/** Called with how long each save and open took (ms). */
	onMeasure?: (what: 'save' | 'restore' | 'check' | 'file', ms: number) => void;
}

export const MAX_PROJECTS = 12;
export const MAX_TOTAL_BYTES = 2 * 1024 * 1024 * 1024;
export const MAX_FILE_BYTES = 1024 * 1024 * 1024;

/** Plain-language lines the UI shows. */
export const STATUS_LINE: Record<SaveState, string> = {
	starting: 'Saved on this device only.',
	saved: 'Saved on this device only.',
	off: 'This work is not being saved. Keeping work on this device is off.',
	'other-tab': 'This work is not being saved. It was changed in another tab.',
	unavailable: 'This work is not being saved. This browser does not allow it here.',
	full: 'This work is not being saved. There is not enough room on this device.',
	limit: `This work is not being saved. Up to ${MAX_PROJECTS} pieces of work are kept on this device.`,
	'too-large': 'This work is not being saved. A file is too large to keep.',
	forgotten: 'This work is not being saved. You removed it from this device.',
	failed: 'This work is not being saved. Storing it on this device failed.'
};

export const BROKEN_MESSAGE = 'Saved work could not be opened, so it was deleted.';

/** The id Home uses for open work that has not been stored yet. */
export const UNSAVED_ID = 'open';

interface Blob_ {
	hash?: string;
	size: number;
	status: 'none' | 'writing' | 'stored' | 'failed';
	writing?: Promise<boolean>;
	failure?: 'full' | 'too-large' | 'failed';
	epoch: number;
}

interface KnownSource extends Blob_ {
	stored: SavedSource['stored'];
	needsPassword: boolean;
	/** Protected files only: the file as given, kept in memory while it is open. */
	original?: Uint8Array;
}

interface Sig {
	pages: DocState['pages'];
	sources: DocState['sources'];
	assets: DocState['assets'];
	formValues: DocState['formValues'];
	dirty: boolean;
	form: string;
}

interface Row {
	summary: ProjectSummary;
	writer: string;
	rev: string;
	/** Stored file hash -> size. */
	hashes: Map<string, number>;
}

function randomId(): string {
	const c = globalThis.crypto;
	if (c?.randomUUID) return c.randomUUID();
	return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
	const subtle = globalThis.crypto?.subtle;
	if (!subtle) throw new Error('SHA-256 is not available here');
	const d = new Uint8Array(await subtle.digest('SHA-256', bytes as BufferSource));
	let s = '';
	for (const b of d) s += b.toString(16).padStart(2, '0');
	return s;
}

function rowOf(rec: SessionRecord): Row {
	const hashes = new Map<string, number>();
	for (const x of [...rec.sources, ...rec.assets]) hashes.set(x.hash, x.size);
	return { summary: summarizeProject(rec), writer: rec.writer, rev: rec.rev, hashes };
}

/** What the first page looks like, for knowing when its thumbnail is out of date. */
function firstKey(st: DocState): string {
	const p = st.pages[0];
	if (!p) return '';
	const c = p.crop;
	return `${p.sourceId}:${p.pageIndex}:${p.rotation}:${c ? `${c.x},${c.y},${c.w},${c.h}` : ''}`;
}

/** States a newly opened or new piece of work starts over from. */
const RECOVERABLE: readonly SaveState[] = ['other-tab', 'full', 'limit', 'too-large', 'forgotten', 'failed'];

export function createSession(deps: SessionDeps) {
	const { store } = deps;
	const now = deps.now ?? (() => Date.now());
	const hash = deps.hash ?? sha256Hex;
	const debounceMs = deps.debounceMs ?? 400;
	const maxWaitMs = deps.maxWaitMs ?? 2000;
	const emptyGraceMs = deps.emptyGraceMs ?? 9000;
	const maxFileBytes = deps.maxFileBytes ?? MAX_FILE_BYTES;
	const maxProjects = deps.maxProjects ?? MAX_PROJECTS;
	const maxTotalBytes = deps.maxTotalBytes ?? MAX_TOTAL_BYTES;
	const sweepGraceMs = deps.sweepGraceMs ?? 10 * 60 * 1000;
	const writer = deps.writerId ?? randomId();
	const newId = deps.newId ?? randomId;

	let state: SaveState = 'starting';
	let storage: SessionStorage | null = null;
	/** Saved projects, as stored (the open one too, once it is stored). */
	const rows = new Map<string, Row>();
	const thumbs = new Map<string, Blob>();
	let elsewhere: ReadonlySet<string> = new Set();
	let opening: string | null = null;

	// ---- the open project
	/** Its id once it has one (at its first save, or when it was opened). */
	let current: string | null = null;
	let lock: ProjectLock | null = null;
	/** The record this tab may overwrite: the one it opened. */
	let replaceable: { writer: string; rev: string } | null = null;
	/** This tab has written (or opened) the current project's record. */
	let hasWritten = false;
	/** Bumped when the open project changes (closed, opened); saves from before do not count. */
	let gen = 0;
	let editedAt = 0;
	let currentThumb: Blob | null = null;
	let thumbKey = '';
	let thumbStored = false;
	let thumbTimer: ReturnType<typeof setTimeout> | null = null;

	/** Bumped when stored data is wiped; writes from before do not count. */
	let epoch = 0;
	const known = new Map<SourceId, KnownSource>();
	const assetBlobs = new Map<string, Blob_>();
	/**
	 * Files this tab wrote, or files of work this tab deleted: swept as soon as nothing
	 * uses them (other unused files wait for the grace time).
	 */
	const writtenHere = new Set<string>();
	/** Sources the user chose to forget (in another tab); work using them is not saved again here. */
	const forgotten = new Set<SourceId>();
	let lastSaved: Sig | null = null;
	let timer: ReturnType<typeof setTimeout> | null = null;
	let firstPending = 0;
	let emptyTimer: ReturnType<typeof setTimeout> | null = null;
	let chain: Promise<void> = Promise.resolve();
	let saving = false;
	let started: Promise<void> | null = null;
	const listeners = new Set<() => void>();

	function emit() {
		for (const l of [...listeners]) l();
	}

	function setState(s: SaveState) {
		if (state === s) return;
		state = s;
		emit();
	}

	function sigOf(st: DocState): Sig {
		return {
			pages: st.pages,
			sources: st.sources,
			assets: st.assets,
			formValues: st.formValues,
			dirty: st.isDirty,
			form: JSON.stringify(deps.exportForm.get())
		};
	}

	function sameSig(a: Sig | null, b: Sig): boolean {
		return (
			!!a &&
			a.pages === b.pages &&
			a.sources === b.sources &&
			a.assets === b.assets &&
			a.formValues === b.formValues &&
			a.dirty === b.dirty &&
			a.form === b.form
		);
	}

	const usesForgotten = (st: DocState) => forgotten.size > 0 && st.sources.some((s) => forgotten.has(s.id));

	function canWrite(): boolean {
		return !!storage && (state === 'saved' || RECOVERABLE.includes(state));
	}

	/** A new project could not be stored: as many as are kept are stored already. */
	const atCountLimit = () => (current === null || !rows.has(current)) && !hasWritten && rows.size >= maxProjects;

	// ------------------------------------------------------------ scheduling

	function schedule() {
		if (!canWrite()) return;
		const t = now();
		if (!timer) firstPending = t;
		if (timer) clearTimeout(timer);
		const wait = Math.max(0, Math.min(debounceMs, firstPending + maxWaitMs - t));
		timer = setTimeout(() => {
			timer = null;
			void flush();
		}, wait);
		emit();
	}

	let restoring = false;

	function onStoreChange() {
		const st = store.state;
		if (st.pages.length > 0 && emptyTimer) {
			clearTimeout(emptyTimer);
			emptyTimer = null;
		}
		if (forgotten.size) {
			if (state === 'saved' && usesForgotten(st)) setState('forgotten');
			else if (state === 'forgotten' && !usesForgotten(st)) setState('saved');
		}
		const sig = sigOf(st);
		if (!sameSig(lastSaved, sig)) {
			if (!restoring) editedAt = now();
			schedule();
		}
		if (deps.thumbnail && !restoring && firstKey(st) !== thumbKey) {
			if (thumbTimer) clearTimeout(thumbTimer);
			thumbTimer = setTimeout(() => void makeThumb(), 800);
		}
	}

	store.subscribe(onStoreChange);

	/** Save now if anything changed (waits for a save already running). */
	function flush(): Promise<void> {
		if (timer) {
			clearTimeout(timer);
			timer = null;
		}
		chain = chain.then(save, save);
		return chain;
	}

	// ------------------------------------------------------------ thumbnails

	async function makeThumb(): Promise<void> {
		if (thumbTimer) clearTimeout(thumbTimer);
		thumbTimer = null;
		const st = store.state;
		const key = firstKey(st);
		if (!deps.thumbnail || key === thumbKey) return;
		const g = gen;
		thumbKey = key;
		let blob: Blob | null = null;
		if (key) {
			try {
				blob = await deps.thumbnail(st);
			} catch {
				blob = null;
			}
		}
		if (g !== gen) return;
		currentThumb = blob;
		thumbStored = false;
		emit();
		void storeThumb();
	}

	async function storeThumb(): Promise<void> {
		const id = current;
		const blob = currentThumb;
		if (!blob || thumbStored || !id || !hasWritten || !storage || !canWrite()) return;
		const g = gen;
		try {
			await storage.putThumb(id, blob);
			if (g !== gen) return;
			thumbStored = true;
			thumbs.set(id, blob);
		} catch {
			// A card without a picture is fine.
		}
	}

	// ------------------------------------------------------------ blobs

	async function writeBlob(b: Blob_, bytes: Uint8Array): Promise<boolean> {
		if (b.status === 'stored' && b.epoch === epoch) return true;
		if (b.status === 'writing' && b.writing && b.epoch === epoch) return b.writing;
		// No room or too large: not tried again until stored data is wiped or `retry`.
		if (b.status === 'failed' && b.epoch === epoch && (b.failure === 'full' || b.failure === 'too-large')) return false;
		const s = storage;
		if (!s) return false;
		const myEpoch = epoch;
		b.epoch = myEpoch;
		b.status = 'writing';
		b.writing = (async () => {
			try {
				if (bytes.length > maxFileBytes) {
					b.failure = 'too-large';
					return false;
				}
				const t0 = performance.now();
				b.hash ??= await hash(bytes);
				if (await s.hasBlob(b.hash)) return true;
				if (storedBytes() + bytes.length > maxTotalBytes) {
					b.failure = 'full';
					return false;
				}
				if (bytes.length > 4 * 1024 * 1024 && deps.estimate) {
					const est = await deps.estimate().catch(() => undefined);
					if (est?.quota !== undefined && est.usage !== undefined && est.quota - est.usage < bytes.length * 1.2 + 16 * 1024 * 1024) {
						b.failure = 'full';
						return false;
					}
				}
				await s.putBlob(b.hash, bytes, now());
				writtenHere.add(b.hash);
				deps.onMeasure?.('file', performance.now() - t0);
				if (epoch !== myEpoch) {
					// Wiped while writing (Forget, switch off): do not leave it behind.
					await s.deleteBlobs([b.hash]).catch(() => undefined);
					return false;
				}
				return true;
			} catch (e) {
				b.failure = e instanceof StorageFullError ? 'full' : 'failed';
				return false;
			}
		})();
		const ok = await b.writing;
		if (b.epoch === myEpoch) {
			b.status = ok ? 'stored' : 'failed';
			b.writing = undefined;
			if (ok) b.failure = undefined;
		}
		return ok && epoch === myEpoch;
	}

	/** Bytes stored for all saved work (each file once). */
	function storedBytes(): number {
		const all = new Map<string, number>();
		for (const r of rows.values()) for (const [h, n] of r.hashes) all.set(h, n);
		let n = 0;
		for (const v of all.values()) n += v;
		return n;
	}

	function knownFor(source: Source): KnownSource | null {
		let k = known.get(source.id);
		if (!k) {
			// Made another way (a blank page) or opened while this tab did not save:
			// normal files can be stored from what is open; protected ones cannot.
			if (source.wasEncrypted) return null;
			k = { stored: 'normalized', needsPassword: false, size: source.bytes.length, status: 'none', epoch };
			known.set(source.id, k);
		}
		return k;
	}

	function bytesOf(source: Source, k: KnownSource): Uint8Array | null {
		return k.stored === 'original' ? (k.original ?? null) : source.bytes;
	}

	// ------------------------------------------------------------ save

	async function save(): Promise<void> {
		if (!canWrite() || restoring) return;
		if (store.gestureActive) {
			schedule();
			return;
		}
		const st = store.state;
		const sig = sigOf(st);
		if (st.pages.length === 0) {
			lastSaved = sig;
			if (hasWritten && current && !emptyTimer) emptyTimer = setTimeout(() => void dropEmpty(), emptyGraceMs);
			emit();
			return;
		}
		if (usesForgotten(st)) return;
		if (sameSig(lastSaved, sig) && current && hasWritten) {
			if (state !== 'saved') setState('saved');
			return;
		}
		if (atCountLimit()) {
			setState('limit');
			return;
		}
		saving = true;
		emit();
		const t0 = performance.now();
		const startEpoch = epoch;
		const g = gen;
		try {
			const blobs = new Map<string, { hash: string; size: number; stored: SavedSource['stored']; needsPassword: boolean }>();
			let failure: SaveState | null = null;
			for (const source of st.sources) {
				const k = knownFor(source);
				const bytes = k && bytesOf(source, k);
				if (!k || !bytes) {
					failure = 'failed';
					break;
				}
				if (!(await writeBlob(k, bytes))) {
					failure = k.failure ?? 'failed';
					break;
				}
				blobs.set(source.id, { hash: k.hash!, size: bytes.length, stored: k.stored, needsPassword: k.needsPassword });
			}
			const assetMap = new Map<string, { hash: string; size: number }>();
			if (!failure) {
				for (const a of st.assets) {
					let b = assetBlobs.get(a.id);
					if (!b) assetBlobs.set(a.id, (b = { size: a.png.length, status: 'none', epoch }));
					if (!(await writeBlob(b, a.png))) {
						failure = b.failure ?? 'failed';
						break;
					}
					assetMap.set(a.id, { hash: b.hash!, size: a.png.length });
				}
			}
			// Wiped or closed while this save ran (Forget, switch off, other work opened): drop it quietly.
			if (!canWrite() || epoch !== startEpoch || g !== gen) return;
			if (failure) {
				setState(failure);
				return;
			}
			if (current === null) {
				const id = newId();
				const held = deps.lock ? await deps.lock(id) : null;
				if (g !== gen) {
					held?.release();
					return;
				}
				current = id;
				lock = held;
			}
			const id = current;
			const rec = buildRecord({
				writer,
				rev: randomId(),
				savedAt: editedAt || now(),
				app: deps.app,
				clean: !st.isDirty,
				sources: st.sources,
				blobs,
				pages: st.pages,
				assets: st.assets,
				assetBlobs: assetMap,
				formValues: st.formValues,
				exportForm: deps.exportForm.get()
			});
			const needs = [...new Set([...blobs.values(), ...assetMap.values()].map((b) => b.hash))];
			let seen: unknown = undefined;
			const res = await storage!.putRecord(
				id,
				rec,
				(cur) => {
					seen = cur;
					if (epoch !== startEpoch) return false;
					if (cur === undefined) return !hasWritten;
					const c = cur as { writer?: unknown; rev?: unknown };
					return c.writer === writer || (replaceable !== null && c.writer === replaceable.writer && c.rev === replaceable.rev);
				},
				needs
			);
			if (epoch !== startEpoch || g !== gen) return;
			if (res === 'conflict') {
				// Someone else wrote or deleted it: stop, never overwrite their work.
				setState(seen === undefined ? 'forgotten' : 'other-tab');
				return;
			}
			if (res === 'missing-blob') {
				// Swept by another tab before this record named it: write the files again.
				for (const k of known.values()) k.status = 'none';
				for (const b of assetBlobs.values()) b.status = 'none';
				setState('failed');
				return;
			}
			hasWritten = true;
			replaceable = null;
			lastSaved = sig;
			rows.set(id, rowOf(rec));
			setState('saved');
			deps.onMeasure?.('save', performance.now() - t0);
			deps.channel?.post('changed');
			void storeThumb();
			if (needsSweep(needs)) void sweep(needs);
		} catch (e) {
			if (g !== gen) return;
			if (e instanceof StorageFullError) setState('full');
			else setState('failed');
		} finally {
			saving = false;
			emit();
			if (canWrite() && !sameSig(lastSaved, sigOf(store.state)) && store.state.pages.length && state !== 'limit') schedule();
		}
	}

	let lastNeeds = '';
	function needsSweep(needs: string[]): boolean {
		const key = [...needs].sort().join(',');
		const changed = key !== lastNeeds;
		lastNeeds = key;
		return changed;
	}

	/** Delete stored files that no saved work, nor anything open here, uses. */
	async function sweep(keep: readonly string[] = []): Promise<void> {
		const s = storage;
		if (!s) return;
		try {
			const live = new Set(keep);
			for (const k of known.values()) if (k.hash) live.add(k.hash);
			for (const b of assetBlobs.values()) if (b.hash) live.add(b.hash);
			// Files this tab wrote and no longer uses go now, whatever their age.
			const mine = new Set([...writtenHere].filter((h) => !live.has(h)));
			await s.sweep(live, hashesOf, now() - sweepGraceMs, mine);
			for (const h of mine) if (!(await s.hasBlob(h))) writtenHere.delete(h);
		} catch {
			// Sweeping is housekeeping; try again next time.
		}
	}

	async function deleteRow(id: string): Promise<void> {
		for (const h of rows.get(id)?.hashes.keys() ?? []) writtenHere.add(h);
		rows.delete(id);
		thumbs.delete(id);
		try {
			await storage?.deleteRecord(id);
		} catch {
			// Left for the 7-day expiry.
		}
		deps.channel?.post('changed');
	}

	async function dropEmpty(): Promise<void> {
		emptyTimer = null;
		if (store.state.pages.length > 0 || !storage || !hasWritten || !current) return;
		const id = current;
		releaseCurrent();
		await deleteRow(id);
		lastNeeds = '';
		await sweep();
		emit();
	}

	/** Forget which project is open (its data stays as it is). */
	function releaseCurrent() {
		gen++;
		lock?.release();
		lock = null;
		current = null;
		hasWritten = false;
		replaceable = null;
		currentThumb = null;
		thumbKey = '';
		thumbStored = false;
		if (thumbTimer) clearTimeout(thumbTimer);
		thumbTimer = null;
	}

	// ------------------------------------------------------------ start

	async function readRows(opts: { tidy: boolean }): Promise<void> {
		const s = storage;
		if (!s) return;
		let broken = false;
		const list = await s.listRecords();
		const held = (await deps.heldElsewhere?.().catch(() => undefined)) ?? new Set<string>();
		const next = new Map<string, Row>();
		for (const { id, raw } of list) {
			try {
				const rec = parseRecord(raw);
				if (isExpired(rec.savedAt, now()) && !held.has(id) && id !== current) {
					if (opts.tidy) {
						await s.deleteRecord(id).catch(() => undefined);
						for (const h of hashesOf(raw)) writtenHere.add(h);
					}
					continue;
				}
				next.set(id, rowOf(rec));
			} catch (e) {
				if (!opts.tidy) continue;
				await s.deleteRecord(id).catch(() => undefined);
				for (const h of hashesOf(raw)) writtenHere.add(h);
				if (e instanceof SessionFormatError) broken = true;
			}
		}
		rows.clear();
		for (const [k, v] of next) rows.set(k, v);
		const t = await s.getThumbs().catch(() => new Map<string, Blob>());
		thumbs.clear();
		for (const [k, v] of t) if (rows.has(k)) thumbs.set(k, v);
		elsewhere = held;
		if (broken) deps.notify?.(BROKEN_MESSAGE, 'error');
	}

	let refreshing: Promise<void> | null = null;
	/** Read the saved work again (another tab saved, opened or closed something). */
	function refresh(): Promise<void> {
		if (!storage || state === 'off') return Promise.resolve();
		refreshing ??= (async () => {
			try {
				await readRows({ tidy: false });
			} catch {
				// Shown as it was.
			} finally {
				refreshing = null;
				emit();
			}
		})();
		return refreshing;
	}

	async function start(): Promise<void> {
		const t0 = performance.now();
		try {
			if (!globalThis.crypto?.subtle && !deps.hash) throw new Error('no crypto');
			storage = await deps.openStorage();
		} catch {
			storage = null;
			setState('unavailable');
			return;
		}
		try {
			// Version 1 kept one piece of work: it becomes the first card.
			await storage.takeLegacy(newId()).catch(() => false);
			await readRows({ tidy: true });
		} catch {
			storage = null;
			setState('unavailable');
			return;
		}
		setState('saved');
		deps.onMeasure?.('check', performance.now() - t0);
		// Orphans from earlier visits, after the first paint.
		setTimeout(() => void sweep(), 0);
		if (store.state.pages.length) schedule();
	}

	function init(): Promise<void> {
		started ??= (async () => {
			deps.channel?.listen(onMessage);
			if (!deps.prefs.get()) {
				setState('off');
				// Make sure nothing is left from before the switch was turned off.
				try {
					await (await deps.openStorage()).clear();
				} catch {
					// Nothing stored, or no storage at all.
				}
				return;
			}
			await start();
		})();
		return started;
	}

	function wipeLocal() {
		epoch++;
		for (const k of known.values()) k.status = 'none';
		for (const b of assetBlobs.values()) b.status = 'none';
		writtenHere.clear();
		hasWritten = false;
		lastSaved = null;
		lastNeeds = '';
		replaceable = null;
		rows.clear();
		thumbs.clear();
		thumbStored = false;
	}

	let refreshTimer: ReturnType<typeof setTimeout> | null = null;
	function onMessage(msg: string) {
		if (msg === 'forgot') {
			wipeLocal();
			for (const s of store.state.sources) forgotten.add(s.id);
			if (canWrite() && store.state.pages.length) setState('forgotten');
			emit();
		} else if (msg === 'off') {
			wipeLocal();
			releaseCurrent();
			if (timer) clearTimeout(timer);
			timer = null;
			setState('off');
		} else if (msg === 'on' && state === 'off') {
			setState('starting');
			void start();
		} else if (msg === 'changed') {
			if (refreshTimer) return;
			refreshTimer = setTimeout(() => {
				refreshTimer = null;
				void refresh();
			}, 300);
		}
	}

	// ------------------------------------------------------------ user actions

	/** Intake opened a file (before it is added to the store). Its bytes are stored now. */
	function noteOpened(source: Source, info: { original: Uint8Array; needsPassword: boolean }) {
		const k: KnownSource = source.wasEncrypted
			? { stored: 'original', needsPassword: info.needsPassword, original: info.original, size: info.original.length, status: 'none', epoch }
			: { stored: 'normalized', needsPassword: false, size: source.bytes.length, status: 'none', epoch };
		known.set(source.id, k);
		void (started ?? Promise.resolve()).then(() => {
			const bytes = bytesOf(source, k);
			if (canWrite() && !atCountLimit() && bytes && known.get(source.id) === k) void writeBlob(k, bytes);
		});
	}

	function sourceReleased(id: SourceId) {
		known.delete(id);
		lastNeeds = '';
		forgotten.delete(id);
	}

	function assetReleased(ids: Iterable<string>) {
		const live = new Set(ids);
		for (const id of [...assetBlobs.keys()]) if (!live.has(id)) assetBlobs.delete(id);
	}

	async function readVerified(s: SessionStorage, h: string, size: number): Promise<Uint8Array> {
		const bytes = await s.getBlob(h);
		if (!bytes || bytes.length !== size) throw new SessionFormatError('damaged', 'a stored file is missing');
		if ((await hash(bytes)) !== h) throw new SessionFormatError('damaged', 'a stored file does not match its hash');
		return bytes;
	}

	const sameSize = (a: { width: number; height: number }, b: { width: number; height: number }) =>
		Math.abs(a.width - b.width) < 0.5 && Math.abs(a.height - b.height) < 0.5;

	async function reopen(saved: SavedSource, bytes: Uint8Array, ask: (a: PasswordAsk) => Promise<string | null>): Promise<Source | null> {
		let error: string | undefined;
		let source: Source;
		for (;;) {
			let pw: string | undefined;
			if (saved.needsPassword) {
				const answer = await ask({ name: saved.name, error });
				if (answer === null) return null;
				pw = answer;
			}
			try {
				source = await deps.engine.openPdf(bytes, saved.name, pw);
				break;
			} catch (e) {
				if (saved.needsPassword && e instanceof EngineError && (e.code === 'password-wrong' || e.code === 'password-required')) {
					error = 'That password did not open the file. Check it and try again.';
					continue;
				}
				throw e;
			}
		}
		if (source.pages.length !== saved.pages.length || !source.pages.every((p, i) => sameSize(p, saved.pages[i])))
			throw new SessionFormatError('damaged', 'a reopened file has different pages');
		return {
			...source,
			id: saved.id,
			name: saved.name,
			kind: saved.kind,
			originalSize: saved.originalSize,
			wasEncrypted: saved.wasEncrypted,
			notes: [...saved.notes],
			...(saved.hasForm !== undefined ? { hasForm: saved.hasForm } : {})
		};
	}

	/**
	 * Open saved project `id` into the (empty) workspace. Password-protected files ask
	 * for their password through `ask` (null skips that file and its pages).
	 */
	async function open(id: string, ask: (a: PasswordAsk) => Promise<string | null>): Promise<OpenResult> {
		const s = storage;
		if (!s || restoring || store.state.pages.length > 0 || !rows.has(id)) return { ok: false, reason: 'unavailable' };
		restoring = true;
		opening = id;
		emit();
		const t0 = performance.now();
		let held: ProjectLock | null = null;
		try {
			if (deps.lock) {
				held = await deps.lock(id);
				if (!held) {
					elsewhere = new Set([...elsewhere, id]);
					return { ok: false, reason: 'elsewhere' };
				}
			}
			const raw = await s.getRecord(id);
			if (raw === undefined) {
				rows.delete(id);
				thumbs.delete(id);
				return { ok: false, reason: 'unavailable' };
			}
			const rec = parseRecord(raw);
			// Every stored file must be there and match its hash before anything is asked.
			const bytes = new Map<string, Uint8Array>();
			for (const x of [...rec.sources, ...rec.assets]) if (!bytes.has(x.hash)) bytes.set(x.hash, await readVerified(s, x.hash, x.size));

			const sources: Source[] = [];
			const restoredKnown = new Map<SourceId, KnownSource>();
			let skipped = 0;
			for (const x of rec.sources) {
				const b = bytes.get(x.hash)!;
				let source: Source | null;
				if (x.stored === 'normalized') {
					source = {
						id: x.id,
						name: x.name,
						kind: x.kind,
						bytes: b,
						pages: x.pages.map((p) => ({ ...p })),
						originalSize: x.originalSize,
						wasEncrypted: x.wasEncrypted,
						notes: [...x.notes],
						...(x.hasForm !== undefined ? { hasForm: x.hasForm } : {})
					};
				} else {
					source = await reopen(x, b, ask);
				}
				if (!source) {
					skipped++;
					continue;
				}
				sources.push(source);
				restoredKnown.set(x.id, {
					stored: x.stored,
					needsPassword: x.needsPassword,
					original: x.stored === 'original' ? b : undefined,
					hash: x.hash,
					size: x.size,
					status: 'stored',
					epoch
				});
			}
			if (!sources.length) return { ok: false, reason: 'skipped' };
			if (store.state.pages.length > 0 || !storage) return { ok: false, reason: 'unavailable' };

			const kept = new Set(sources.map((x) => x.id));
			const pages = rec.pages.filter((p) => kept.has(p.sourceId));
			const usedAssets = new Set(pages.flatMap((p) => p.stamps.flatMap((st) => (st.kind === 'image' ? [st.assetId] : []))));
			const assets = rec.assets
				.filter((a) => skipped === 0 || usedAssets.has(a.id))
				.map((a) => ({ id: a.id, kind: a.kind, width: a.width, height: a.height, png: bytes.get(a.hash)! }));
			const formValues = Object.fromEntries(Object.entries(rec.formValues).filter(([fid]) => kept.has(fid)));
			releaseCurrent();
			store.restore({ sources, pages, assets, formValues }, { clean: rec.clean && skipped === 0 });
			deps.exportForm.set(rec.exportForm);

			for (const [sid, k] of restoredKnown) known.set(sid, k);
			for (const a of rec.assets) assetBlobs.set(a.id, { hash: a.hash, size: a.size, status: 'stored', epoch });
			current = id;
			lock = held;
			held = null;
			// The record is still the one opened; the first save takes it over.
			replaceable = { writer: rec.writer, rev: rec.rev };
			hasWritten = true;
			editedAt = rec.savedAt;
			lastSaved = skipped ? null : sigOf(store.state);
			currentThumb = thumbs.get(id) ?? null;
			thumbStored = !!currentThumb;
			thumbKey = currentThumb ? firstKey(store.state) : '';
			if (RECOVERABLE.includes(state)) setState('saved');
			deps.onMeasure?.('restore', performance.now() - t0);
			deps.channel?.post('changed');
			if (skipped) {
				editedAt = now();
				schedule();
			}
			if (!currentThumb && deps.thumbnail) void makeThumb();
			return { ok: true, skipped };
		} catch (e) {
			console.warn('Saved work could not be opened:', e);
			await deleteRow(id);
			await sweep();
			return { ok: false, reason: 'broken' };
		} finally {
			held?.release();
			restoring = false;
			opening = null;
			emit();
		}
	}

	/**
	 * Unload the open work (after `flush`, or after the user agreed to lose it). It stays
	 * saved if it was; the workspace is empty and the next files start new work.
	 */
	function close(): void {
		if (timer) clearTimeout(timer);
		timer = null;
		const id = current;
		if (emptyTimer) {
			// Emptied (Start over) and now closed: its undo window ends here.
			clearTimeout(emptyTimer);
			emptyTimer = null;
			if (id && hasWritten && store.state.pages.length === 0) void deleteRow(id).then(() => sweep());
		}
		releaseCurrent();
		store.reset();
		if (timer) clearTimeout(timer);
		timer = null;
		known.clear();
		assetBlobs.clear();
		forgotten.clear();
		lastSaved = sigOf(store.state);
		lastNeeds = '';
		editedAt = 0;
		if (RECOVERABLE.includes(state)) setState(storage ? 'saved' : state);
		deps.channel?.post('changed');
		emit();
	}

	/** Delete one piece of saved work. If it is the open one, it is closed too. */
	async function forgetProject(id: string): Promise<boolean> {
		if (elsewhere.has(id)) return false;
		if (id === UNSAVED_ID || id === current) {
			const was = current;
			close();
			await chain.catch(() => undefined);
			if (was) await deleteRow(was);
		} else {
			await deleteRow(id);
		}
		lastNeeds = '';
		await sweep();
		emit();
		return true;
	}

	async function clearEverything(): Promise<boolean> {
		try {
			const s = storage ?? (await deps.openStorage());
			await s.clear();
			return true;
		} catch {
			return false;
		}
	}

	/** "Forget all my work": delete every piece of saved work and every stored file now, and close what is open. */
	async function forget(): Promise<boolean> {
		if (store.state.pages.length) close();
		wipeLocal();
		if (timer) clearTimeout(timer);
		timer = null;
		await chain.catch(() => undefined);
		const ok = await clearEverything();
		deps.channel?.post('forgot');
		emit();
		return ok;
	}

	/** Try again after room was made (work forgotten). */
	async function retry(): Promise<void> {
		await refresh();
		for (const k of known.values()) if (k.status === 'failed') k.status = 'none';
		for (const b of assetBlobs.values()) if (b.status === 'failed') b.status = 'none';
		if (state === 'full' || state === 'limit' || state === 'too-large' || state === 'failed') setState('saved');
		lastSaved = null;
		schedule();
	}

	/** The remembered switch. Off deletes what is stored; what is open stays open, in this tab only. */
	async function setKeep(on: boolean): Promise<void> {
		deps.prefs.set(on);
		if (!on) {
			wipeLocal();
			releaseCurrent();
			if (timer) clearTimeout(timer);
			timer = null;
			setState('off');
			await chain.catch(() => undefined);
			await clearEverything();
			deps.channel?.post('off');
			emit();
			return;
		}
		deps.channel?.post('on');
		if (state !== 'off') return;
		setState('starting');
		if (storage) {
			setState('saved');
			await refresh();
			schedule();
			return;
		}
		await start();
	}

	/** The page is going away: save what is pending, finish a Start over. */
	function pageHide() {
		if (timer) void flush();
		if (emptyTimer) {
			clearTimeout(emptyTimer);
			void dropEmpty();
		}
	}

	function openCard(): ProjectCard | null {
		const st = store.state;
		if (!st.pages.length) return null;
		const sizes = new Map<string, number>();
		for (const s of st.sources) {
			const k = known.get(s.id);
			sizes.set(k?.hash ?? s.id, k?.size ?? s.bytes.length);
		}
		const stored = !!current && hasWritten && rows.has(current) && (state === 'saved' || state === 'starting');
		return {
			id: current ?? UNSAVED_ID,
			name: projectName(st.sources),
			files: st.sources.filter((s) => s.kind !== 'blank').length,
			pages: st.pages.length,
			savedAt: editedAt || now(),
			needsPassword: st.sources.some((s) => known.get(s.id)?.needsPassword),
			bytes: [...sizes.values()].reduce((a, b) => a + b, 0),
			open: true,
			saved: stored,
			elsewhere: false,
			thumb: currentThumb
		};
	}

	return {
		init,
		noteOpened,
		sourceReleased,
		assetReleased,
		open,
		close,
		forgetProject,
		forget,
		retry,
		refresh,
		setKeep,
		flush,
		pageHide,
		/** Make the open work's thumbnail now if it is out of date (before Home shows it). */
		thumbNow: () => makeThumb(),
		/** Export options changed. */
		touch: () => onStoreChange(),
		sweep,
		subscribe(fn: () => void) {
			listeners.add(fn);
			return () => void listeners.delete(fn);
		},
		get state(): SaveState {
			return state;
		},
		get line(): string {
			return STATUS_LINE[state];
		},
		/** True when this tab saves the open work (or would, once something changes). */
		get saving(): boolean {
			return state === 'saved' || state === 'starting';
		},
		/** Home's cards: the open work first, then saved work, last edited first. */
		get cards(): ProjectCard[] {
			const out: ProjectCard[] = [];
			const mine = openCard();
			if (mine) out.push(mine);
			const others = [...rows].filter(([id]) => id !== current).sort((a, b) => b[1].summary.savedAt - a[1].summary.savedAt);
			for (const [id, r] of others)
				out.push({ ...r.summary, id, open: false, saved: true, elsewhere: elsewhere.has(id), thumb: thumbs.get(id) ?? null });
			return out;
		},
		/** The project being opened, while it opens. */
		get opening(): string | null {
			return opening;
		},
		get restoring() {
			return restoring;
		},
		get current() {
			return current;
		},
		get keep() {
			return deps.prefs.get();
		},
		get limits() {
			return { maxProjects, maxTotalBytes };
		},
		/** Leaving now loses nothing: the open work is stored as it is. */
		get safeToLeave(): boolean {
			const st = store.state;
			if (st.pages.length === 0) return true;
			return state === 'saved' && !!current && hasWritten && !timer && !saving && sameSig(lastSaved, sigOf(st));
		}
	};
}

export type Session = ReturnType<typeof createSession>;
