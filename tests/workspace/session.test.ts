import { createHash } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Asset, PageRef, Source, Stamp } from '../../src/lib/core/types';
import { createDocStore, type DocState, type DocStore } from '../../src/lib/doc/store';
import { EngineError } from '../../src/lib/engine/errors';
import {
	EXPIRY_MS,
	SCHEMA,
	SessionFormatError,
	buildRecord,
	cleanExportForm,
	describeBytes,
	describeSize,
	describeSummary,
	hashesOf,
	parseRecord,
	savedAgo,
	type SavedExportForm
} from '../../src/lib/session/format';
import { BROKEN_MESSAGE, UNSAVED_ID, createSession, sha256Hex } from '../../src/lib/session/session';
import { memoryStorage } from '../../src/lib/session/storage';
import { DEFAULT_FORM } from '../../src/lib/workspace/logic';

// ---------------------------------------------------------------- fixtures

const enc = new TextEncoder();
const pdfBytes = (tag: string, n = 64) => {
	const b = new Uint8Array(n);
	b.set(enc.encode(`%PDF-1.7 ${tag}`));
	return b;
};

function source(id: string, pages: number, extra: Partial<Source> = {}): Source {
	return {
		id,
		name: `${id}.pdf`,
		kind: 'pdf',
		bytes: pdfBytes(id),
		pages: Array.from({ length: pages }, (_, i) => ({ width: 612 + i, height: 792 })),
		originalSize: 1000 + pages,
		wasEncrypted: false,
		notes: [],
		...extra
	};
}

const asset = (id: string): Asset => ({ id, kind: 'signature', png: pdfBytes(`png-${id}`, 40), width: 120, height: 40 });

/** One stamp of every kind and shape the workspace can make. */
const everyStamp = (): Stamp[] => [
	{ id: 's-img', kind: 'image', assetId: 'sig', box: { x: 0.1, y: 0.2, w: 0.3, h: 0.1 } },
	{ id: 's-text', kind: 'text', text: 'Jane Doe, 9 Nov — “ok”', x: 0.12, y: 0.8, size: 0.014, color: 'blue' },
	{ id: 's-check', kind: 'mark', mark: 'check', box: { x: 0.8, y: 0.1, w: 0.03, h: 0.03 } },
	{ id: 's-cross', kind: 'mark', mark: 'cross', box: { x: 0.7, y: 0.1, w: 0.03, h: 0.03 } },
	{ id: 's-dot', kind: 'mark', mark: 'dot', box: { x: 0.6, y: 0.1, w: 0.02, h: 0.02 } },
	{ id: 's-hl-box', kind: 'highlight', color: 'yellow', box: { x: 0.1, y: 0.4, w: 0.5, h: 0.03 } },
	{
		id: 's-hl-pen',
		kind: 'highlight',
		color: 'green',
		box: { x: 0.1, y: 0.5, w: 0.4, h: 0.04 },
		pen: { width: 0.02, points: [{ x: 0.11, y: 0.52 }, { x: 0.3, y: 0.51 }, { x: 0.49, y: 0.53 }] }
	},
	{
		id: 's-hl-text',
		kind: 'highlight',
		color: 'pink',
		box: { x: 0.1, y: 0.6, w: 0.6, h: 0.05 },
		rects: [
			{ x: 0.1, y: 0.6, w: 0.6, h: 0.02 },
			{ x: 0.1, y: 0.63, w: 0.3, h: 0.02 }
		]
	},
	{ id: 's-redact', kind: 'redact', box: { x: 0.2, y: 0.7, w: 0.2, h: 0.03 } },
	// Snap on tap: text and a tick linked to the blank they were put in.
	{ id: 's-snap-text', kind: 'text', text: 'Jane', x: 0.22, y: 0.11, size: 0.014, color: 'black', blank: { kind: 'text', box: { x: 0.21, y: 0.1, w: 0.26, h: 0.03 } } },
	// Turned with a rotated page (schema 3).
	{ id: 's-turn-text', kind: 'text', text: 'Turned', x: 0.6, y: 0.2, size: 0.02, color: 'blue', turn: 90 },
	{ id: 's-turn-check', kind: 'mark', mark: 'check', box: { x: 0.5, y: 0.5, w: 0.03, h: 0.04 }, turn: 270 },
	{ id: 's-snap-check', kind: 'mark', mark: 'check', box: { x: 0.21, y: 0.33, w: 0.015, h: 0.011 }, blank: { kind: 'check', box: { x: 0.21, y: 0.33, w: 0.015, h: 0.011 } } }
];

function fakeEngine(password = 'secret') {
	const calls: { name: string; pw?: string }[] = [];
	return {
		calls,
		async openPdf(bytes: Uint8Array, name: string, pw?: string): Promise<Source> {
			calls.push({ name, pw });
			if (pw !== password) throw new EngineError(pw === undefined ? 'password-required' : 'password-wrong', 'needs a password');
			return {
				...source('fresh', 2),
				name,
				bytes: pdfBytes(`decrypted-${bytes.length}`),
				wasEncrypted: true,
				limits: { password: true, print: true, copy: true, edit: false, fill: false }
			};
		}
	};
}

interface Rig {
	store: DocStore;
	storage: ReturnType<typeof memoryStorage>;
	session: ReturnType<typeof createSession>;
	clock: { t: number };
	form: { value: SavedExportForm };
	prefs: { on: boolean };
	notes: string[];
	engine: ReturnType<typeof fakeEngine>;
}

/** Locks shared by the rigs of one test: two rigs on one storage are two tabs. */
function lockHouse() {
	const held = new Map<string, string>();
	return {
		held,
		lock: (tab: string) => async (id: string) => {
			if (held.has(id) && held.get(id) !== tab) return null;
			held.set(id, tab);
			return { release: () => held.get(id) === tab && held.delete(id) };
		},
		elsewhere: (tab: string) => async () => new Set([...held].filter(([, t]) => t !== tab).map(([id]) => id))
	};
}

/** A BroadcastChannel stand-in shared by the rigs of one test. */
function bus() {
	const fns: ((m: string) => void)[] = [];
	return () => {
		let mine: ((m: string) => void) | null = null;
		return {
			post: (m: string) => {
				for (const f of fns) if (f !== mine) f(m);
			},
			listen: (fn: (m: string) => void) => {
				mine = fn;
				fns.push(fn);
			}
		};
	};
}

let ids = 0;

function rig(
	opts: {
		storage?: ReturnType<typeof memoryStorage>;
		t?: number;
		keep?: boolean;
		writer?: string;
		maxFileBytes?: number;
		maxProjects?: number;
		maxTotalBytes?: number;
		sweepGraceMs?: number;
		house?: ReturnType<typeof lockHouse>;
		channel?: ReturnType<typeof bus>;
		thumbnail?: (st: DocState) => Promise<Blob | null>;
	} = {}
): Rig {
	const store = createDocStore();
	const storage = opts.storage ?? memoryStorage();
	const clock = { t: opts.t ?? Date.UTC(2026, 10, 12, 12) };
	const form = { value: { ...DEFAULT_FORM } as SavedExportForm };
	const prefs = { on: opts.keep ?? true };
	const notes: string[] = [];
	const engine = fakeEngine();
	const tab = opts.writer ?? `tab${++ids}`;
	const session = createSession({
		store,
		engine,
		openStorage: async () => storage,
		lock: opts.house?.lock(tab),
		heldElsewhere: opts.house?.elsewhere(tab),
		thumbnail: opts.thumbnail,
		prefs: { get: () => prefs.on, set: (v) => (prefs.on = v) },
		exportForm: { get: () => form.value, set: (f) => (form.value = f) },
		app: 'test',
		now: () => clock.t,
		notify: (m) => notes.push(m),
		channel: opts.channel?.(),
		debounceMs: 50,
		maxWaitMs: 200,
		emptyGraceMs: 1000,
		writerId: tab,
		newId: () => `p${++ids}`,
		maxFileBytes: opts.maxFileBytes,
		maxProjects: opts.maxProjects,
		maxTotalBytes: opts.maxTotalBytes,
		// Files another tab wrote are left alone this long; most tests sweep at once.
		sweepGraceMs: opts.sweepGraceMs ?? -1,
		// Same digest as sha256Hex (checked below), but settles on the fake clock.
		hash: async (b) => createHash('sha256').update(b).digest('hex')
	});
	return { store, storage, session, clock, form, prefs, notes, engine };
}

/** The one saved card's id. */
function onlyCard(r: Rig): string {
	const saved = r.session.cards.filter((c) => !c.open);
	expect(saved).toHaveLength(1);
	return saved[0].id;
}

/** Let debounced saves and their async writes finish. */
async function settle(ms = 300) {
	await vi.advanceTimersByTimeAsync(ms);
	await vi.advanceTimersByTimeAsync(0);
}

function snapshotDoc(store: DocStore) {
	const s = store.state;
	return JSON.parse(
		JSON.stringify({
			sources: s.sources.map((x) => ({ ...x, bytes: Array.from(x.bytes) })),
			pages: s.pages,
			assets: s.assets.map((a) => ({ ...a, png: Array.from(a.png) })),
			formValues: s.formValues
		})
	);
}

/** Two files, reordered, rotated, duplicated, a blank page, every stamp kind, form answers. */
function buildWork(r: Rig) {
	const a = source('a', 3, { hasForm: true, notes: ['Repaired a damaged cross-reference table.'] });
	const b = source('b', 2);
	const blank: Source = { ...source('blank', 1), kind: 'blank', name: 'Blank page' };
	r.session.noteOpened(a, { original: pdfBytes('orig-a'), needsPassword: false });
	r.session.noteOpened(b, { original: pdfBytes('orig-b'), needsPassword: false });
	r.store.addSource(a);
	r.store.addSource(b);
	r.store.addSource(blank, 1);
	r.store.addAsset(asset('sig'));
	const ids = r.store.state.pages.map((p) => p.id);
	r.store.movePages([ids[ids.length - 1]], 0);
	r.store.rotatePages([ids[2]], 90);
	r.store.rotatePages([ids[3]], -90);
	r.store.duplicatePages([ids[2]]);
	for (const st of everyStamp()) r.store.addStamp(ids[0], st);
	r.store.setFormValue('a', 'name', 'Jane');
	r.store.setFormValue('a', 'agree', true);
	r.store.setFormValue('a', 'colours', ['red', 'blue']);
	r.form.value = { ...r.form.value, compress: false, number: true, style: 'bates', prefix: 'ACME-', digits: '7' };
	r.session.touch();
}

beforeEach(() => {
	vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
});
afterEach(() => {
	vi.useRealTimers();
});

// ---------------------------------------------------------------- format

describe('sha256Hex', () => {
	it('is the SHA-256 of the bytes', async () => {
		const b = pdfBytes('x', 1000);
		expect(await sha256Hex(b)).toBe(createHash('sha256').update(b).digest('hex'));
	});
});

describe('format', () => {
	const base = () => {
		const sources = [source('a', 2)];
		const pages: PageRef[] = [
			{ id: 'p1', sourceId: 'a', pageIndex: 1, rotation: 270, stamps: everyStamp() },
			{ id: 'p2', sourceId: 'a', pageIndex: 0, rotation: 0, stamps: [] },
			// Cropped (schema 4).
			{ id: 'p3', sourceId: 'a', pageIndex: 0, rotation: 90, stamps: [], crop: { x: 0.1, y: 0.2, w: 0.5, h: 0.6 } }
		];
		return buildRecord({
			writer: 'w',
			rev: 'r1',
			savedAt: 5,
			app: 'v1',
			clean: false,
			sources,
			blobs: new Map([['a', { hash: 'a'.repeat(64), size: 64, stored: 'normalized' as const, needsPassword: false }]]),
			pages,
			assets: [asset('sig')],
			assetBlobs: new Map([['sig', { hash: 'b'.repeat(64), size: 40 }]]),
			formValues: { a: { t: 'x', c: false, l: ['1', '2'] } },
			exportForm: { ...DEFAULT_FORM, password: 'hunter2', filename: 'x.pdf' } as unknown as SavedExportForm
		});
	};

	it('round-trips every stamp kind, pages, assets, answers and options exactly', () => {
		const rec = base();
		const back = parseRecord(structuredClone(rec));
		expect(back).toEqual(rec);
		expect(back.pages[0].stamps).toEqual(everyStamp());
		expect(back.pages[2].crop).toEqual({ x: 0.1, y: 0.2, w: 0.5, h: 0.6 });
		expect('crop' in back.pages[1]).toBe(false);
		expect(back.schema).toBe(SCHEMA);
		// A schema 3 record (no crops) still reads.
		const v3 = structuredClone({ ...rec, schema: 3, pages: rec.pages.slice(0, 2) });
		expect(parseRecord(v3).pages).toHaveLength(2);
	});

	it('never keeps an export password or file name', () => {
		const rec = base();
		expect(JSON.stringify(rec)).not.toContain('hunter2');
		expect('password' in rec.exportForm).toBe(false);
		expect('filename' in rec.exportForm).toBe(false);
		expect(cleanExportForm({ ...DEFAULT_FORM, password: 'x' } as never)).toEqual(DEFAULT_FORM);
	});

	it('keeps the print-size cap choice; records from before it read as on (the default)', () => {
		expect(cleanExportForm({ ...DEFAULT_FORM, printCap: false }).printCap).toBe(false);
		const { printCap: _gone, ...old } = DEFAULT_FORM;
		expect(cleanExportForm(old).printCap).toBe(true);
	});

	it('pictures and split choices: kept when valid, defaults for old records and odd values', () => {
		const kept = cleanExportForm({ ...DEFAULT_FORM, output: 'png', pictureQuality: 'print', split: true, splitRule: 'at', splitEvery: '3', splitAt: '5, 12' });
		expect(kept).toMatchObject({ output: 'png', pictureQuality: 'print', split: true, splitRule: 'at', splitEvery: '3', splitAt: '5, 12' });
		const { output: _o, pictureQuality: _q, split: _s, splitRule: _r, splitEvery: _e, splitAt: _a, ...old } = DEFAULT_FORM;
		expect(cleanExportForm(old)).toEqual(DEFAULT_FORM);
		expect(cleanExportForm(old)).toMatchObject({ output: 'pdf', split: false, splitRule: 'each' });
		const odd = cleanExportForm({ ...DEFAULT_FORM, output: 'gif' as never, splitRule: 'random' as never, pictureQuality: 7 as never });
		expect(odd).toMatchObject({ output: 'pdf', splitRule: 'each', pictureQuality: 'screen' });
	});

	it('reads schema 2 records (before turned stamps) and refuses a bad turn', () => {
		const rec = base();
		const v2 = structuredClone({ ...rec, schema: 2 }) as unknown as { pages: { stamps: Record<string, unknown>[] }[] };
		for (const p of v2.pages) p.stamps = p.stamps.filter((st) => !String(st.id).startsWith('s-turn'));
		const back = parseRecord(v2);
		expect(back.pages[0].stamps.some((x) => 'turn' in x)).toBe(false);
		const bad = structuredClone(rec) as unknown as { pages: { stamps: Record<string, unknown>[] }[] };
		bad.pages[0].stamps.find((x) => x.id === 's-turn-text')!.turn = 45;
		expect(() => parseRecord(bad)).toThrow(SessionFormatError);
	});

	it('still reads schema 1 records (before links to blanks)', () => {
		const rec = base();
		const v1 = structuredClone({ ...rec, schema: 1 }) as unknown as { pages: { stamps: Record<string, unknown>[] }[] };
		for (const p of v1.pages) for (const st of p.stamps) delete st.blank;
		const back = parseRecord(v1);
		expect(back.schema).toBe(SCHEMA);
		expect(back.pages[0].stamps.find((x) => x.id === 's-snap-text')).toEqual({ id: 's-snap-text', kind: 'text', text: 'Jane', x: 0.22, y: 0.11, size: 0.014, color: 'black' });
	});

	it('refuses other schema versions, older and newer', () => {
		for (const schema of [0, SCHEMA + 1, 99]) {
			const raw = { ...base(), schema };
			expect(() => parseRecord(raw)).toThrow(SessionFormatError);
			try {
				parseRecord(raw);
			} catch (e) {
				expect((e as SessionFormatError).reason).toBe('version');
			}
		}
	});

	it('refuses damaged records', () => {
		const bad: ((r: Record<string, unknown>) => void)[] = [
			(r) => ((r.pages as PageRef[])[0].rotation = 45 as never),
			(r) => ((r.pages as PageRef[])[0].pageIndex = 7),
			(r) => ((r.pages as PageRef[])[0].sourceId = 'zz'),
			(r) => (((r.pages as PageRef[])[0].stamps[1] as { color: string }).color = 'green'),
			(r) => (((r.pages as PageRef[])[0].stamps[0] as { assetId: string }).assetId = 'nope'),
			(r) => (((r.pages as PageRef[])[0].stamps[0] as { kind: string }).kind = 'sticker'),
			(r) => ((r.sources as { hash: string }[])[0].hash = 'xyz'),
			(r) => (((r.pages as PageRef[])[0].stamps.find((x) => x.id === 's-snap-text') as { blank: { kind: string } }).blank.kind = 'check'),
			(r) => (((r.pages as PageRef[])[0].stamps.find((x) => x.id === 's-snap-check') as { blank: unknown }).blank = { kind: 'check', box: { x: 'a' } }),
			(r) => ((r.sources as { wasEncrypted: boolean }[])[0].wasEncrypted = true),
			(r) => (r.formValues = { other: { a: 'b' } }),
			(r) => (r.pages = []),
			(r) => delete r.writer
		];
		for (const f of bad) {
			const raw = structuredClone(base()) as unknown as Record<string, unknown>;
			f(raw);
			expect(() => parseRecord(raw)).toThrow(SessionFormatError);
		}
		expect(() => parseRecord('nonsense')).toThrow(SessionFormatError);
		expect(() => parseRecord(null)).toThrow(SessionFormatError);
	});

	it('describes the offer in plain words', () => {
		const t = 1_000_000_000;
		expect(describeSummary({ files: 3, pages: 12, savedAt: t - 2 * 3600_000 }, t)).toBe('3 files, 12 pages, saved 2 hours ago');
		expect(describeSummary({ files: 1, pages: 1, savedAt: t }, t)).toBe('1 file, 1 page, saved just now');
		expect(describeSummary({ files: 0, pages: 2, savedAt: t - 60_000 }, t)).toBe('2 pages, saved 1 minute ago');
		expect(savedAgo(t - 30 * 3600_000, t)).toBe('saved yesterday');
		expect(savedAgo(t - 3 * 86400_000, t)).toBe('saved 3 days ago');
	});
});

// ---------------------------------------------------------------- controller


describe('format: Home cards', () => {
	it('says sizes, ages and names plainly, and finds the files a record names', () => {
		const t = 1_000_000_000;
		expect(describeSize({ files: 3, pages: 12 })).toBe('3 files, 12 pages');
		expect(describeSize({ files: 1, pages: 1 })).toBe('1 page');
		expect(savedAgo(t - 2 * 3600_000, t, 'edited')).toBe('edited 2 hours ago');
		expect(describeBytes(2048)).toBe('2 KB');
		expect(describeBytes(4.24 * 1024 * 1024)).toBe('4.2 MB');
		expect(hashesOf({ sources: [{ hash: 'a' }], assets: [{ hash: 'b' }, { nope: 1 }] })).toEqual(['a', 'b']);
		expect(hashesOf('junk')).toEqual([]);
	});
});

describe('session: one piece of work', () => {
	it('saves after changes and opens the identical document', async () => {
		const r = rig();
		await r.session.init();
		buildWork(r);
		await settle();
		expect(r.session.state).toBe('saved');
		expect(r.session.safeToLeave).toBe(true);
		const before = snapshotDoc(r.store);
		const rec = parseRecord(r.storage.raw());
		expect(rec.sources.map((s) => s.id)).toEqual(['a', 'b', 'blank']);
		expect(rec.exportForm.prefix).toBe('ACME-');
		// Each file stored once, by hash, and nothing else.
		const expected = new Set([
			await sha256Hex(pdfBytes('a')),
			await sha256Hex(pdfBytes('b')),
			await sha256Hex(pdfBytes('blank')),
			await sha256Hex(asset('sig').png)
		]);
		expect(new Set(r.storage.blobs.keys())).toEqual(expected);
		// The open card is first and saved.
		expect(r.session.cards).toHaveLength(1);
		expect(r.session.cards[0]).toMatchObject({ open: true, saved: true, name: 'a.pdf', files: 2, pages: 7 });

		// Next visit: a card, nothing loaded.
		const r2 = rig({ storage: r.storage, t: r.clock.t + 3600_000 });
		await r2.session.init();
		expect(r2.store.state.pages).toHaveLength(0);
		const id = onlyCard(r2);
		expect(r2.session.cards[0]).toMatchObject({ files: 2, pages: 7, savedAt: r.clock.t, name: 'a.pdf', open: false, saved: true, elsewhere: false });
		const res = await r2.session.open(id, async () => null);
		expect(res).toEqual({ ok: true, skipped: 0 });
		expect(snapshotDoc(r2.store)).toEqual(before);
		expect(r2.form.value.prefix).toBe('ACME-');
		expect(r2.form.value.compress).toBe(false);
		expect(r2.store.state.canUndo).toBe(false);
		expect(r2.session.current).toBe(id);
		expect(r2.session.cards.map((c) => c.open)).toEqual([true]);
		// The same export plan as the unbroken session.
		const opts = { filename: 'x.pdf', compress: false, stripMetadata: false };
		expect(JSON.parse(JSON.stringify(r2.store.toExportPlan(opts)))).toEqual(JSON.parse(JSON.stringify(r.store.toExportPlan(opts))));
		// Changes after opening are saved to the same piece of work.
		r2.store.rotatePages([r2.store.state.pages[0].id], 90);
		await settle();
		expect([...r.storage.records.keys()]).toEqual([id]);
		expect(parseRecord(r.storage.records.get(id)).pages[0].rotation).toBe(90);
	});

	it('a save writes only the record: file bytes are written once', async () => {
		const r = rig();
		await r.session.init();
		r.session.noteOpened(source('a', 2), { original: pdfBytes('x'), needsPassword: false });
		r.store.addSource(source('a', 2));
		await settle();
		const spy = vi.spyOn(r.storage, 'putBlob');
		for (let i = 0; i < 5; i++) {
			r.store.rotatePages([r.store.state.pages[0].id], 90);
			await settle();
		}
		expect(spy).not.toHaveBeenCalled();
		expect(parseRecord(r.storage.raw()).pages[0].rotation).toBe(90);
	});

	it('does not save undo history, selection or the export password', async () => {
		const r = rig();
		await r.session.init();
		buildWork(r);
		r.store.selectAll();
		r.form.value = { ...r.form.value, ...({ password: 'pässwörd' } as object) } as SavedExportForm;
		r.session.touch();
		await settle();
		const text = JSON.stringify(r.storage.raw());
		expect(text).not.toContain('pässwörd');
		expect(text).not.toMatch(/undo|selection/i);
	});

	it('opening refuses a blob whose hash does not match and deletes that work', async () => {
		const r = rig();
		await r.session.init();
		buildWork(r);
		await settle();
		const h = parseRecord(r.storage.raw()).sources[0].hash;
		r.storage.blobs.get(h)![20] ^= 0xff;
		const r2 = rig({ storage: r.storage });
		await r2.session.init();
		expect(await r2.session.open(onlyCard(r2), async () => null)).toEqual({ ok: false, reason: 'broken' });
		expect(r2.store.state.pages).toHaveLength(0);
		expect(r.storage.records.size).toBe(0);
		expect(r.storage.blobs.size).toBe(0);
		expect(r2.session.cards).toEqual([]);
	});

	it('opening refuses a missing blob', async () => {
		const r = rig();
		await r.session.init();
		buildWork(r);
		await settle();
		r.storage.blobs.delete(parseRecord(r.storage.raw()).assets[0].hash);
		const r2 = rig({ storage: r.storage });
		await r2.session.init();
		expect(await r2.session.open(onlyCard(r2), async () => null)).toEqual({ ok: false, reason: 'broken' });
		expect(r2.store.state.pages).toHaveLength(0);
		expect(r.storage.records.size).toBe(0);
	});

	it('a record of another schema version is deleted at load and the user is told', async () => {
		const r = rig();
		await r.session.init();
		buildWork(r);
		await settle();
		r.storage.setRaw({ ...(r.storage.raw() as object), schema: SCHEMA + 1 });
		const r2 = rig({ storage: r.storage });
		await r2.session.init();
		await settle(10);
		expect(r2.session.cards).toEqual([]);
		expect(r2.notes).toEqual([BROKEN_MESSAGE]);
		expect(r.storage.records.size).toBe(0);
		expect(r.storage.blobs.size).toBe(0);
	});

	it('expires 7 days after the last change (fake clock), each piece of work on its own', async () => {
		const r = rig();
		await r.session.init();
		buildWork(r);
		await settle();
		const saved = r.clock.t;
		r.session.close();
		r.clock.t += 2 * 86400_000;
		r.store.addSource(source('later', 1));
		await settle();
		expect(r.storage.records.size).toBe(2);
		const early = rig({ storage: r.storage, t: saved + EXPIRY_MS - 1000 });
		await early.session.init();
		expect(early.session.cards).toHaveLength(2);
		const late = rig({ storage: r.storage, t: saved + EXPIRY_MS + 1 });
		await late.session.init();
		await settle(10);
		expect(late.session.cards.map((c) => c.name)).toEqual(['later.pdf']);
		expect(r.storage.records.size).toBe(1);
		expect([...r.storage.blobs.keys()]).toEqual([await sha256Hex(pdfBytes('later'))]);
	});

	it('no room: the work stays open, nothing is saved, the line says so, leaving warns', async () => {
		const r = rig({ storage: memoryStorage({ quotaBytes: 100 }) });
		await r.session.init();
		buildWork(r);
		await settle();
		expect(r.session.state).toBe('full');
		expect(r.session.line).toBe('This work is not being saved. There is not enough room on this device.');
		expect(r.session.safeToLeave).toBe(false);
		expect(r.storage.records.size).toBe(0);
		expect(r.store.state.pages.length).toBe(7);
		expect(r.session.cards[0]).toMatchObject({ open: true, saved: false });
	});

	it('a file over the size limit is not kept', async () => {
		const r = rig({ maxFileBytes: 10 });
		await r.session.init();
		r.store.addSource(source('a', 1));
		await settle();
		expect(r.session.state).toBe('too-large');
		expect(r.storage.records.size).toBe(0);
	});

	it('storage that will not open: state unavailable, never throws', async () => {
		const store = createDocStore();
		const session = createSession({
			store,
			engine: fakeEngine(),
			openStorage: async () => {
				throw new DOMException('blocked', 'SecurityError');
			},
			prefs: { get: () => true, set: () => undefined },
			exportForm: { get: () => ({ ...DEFAULT_FORM }), set: () => undefined },
			app: 't'
		});
		await session.init();
		store.addSource(source('a', 1));
		await settle(3000);
		expect(session.state).toBe('unavailable');
		expect(session.safeToLeave).toBe(false);
		expect(session.cards).toHaveLength(1);
		expect(session.cards[0]).toMatchObject({ id: UNSAVED_ID, open: true, saved: false });
	});

	it('the off switch deletes what is stored and stops saving; what is open stays in this tab; on again saves it', async () => {
		const r = rig();
		await r.session.init();
		buildWork(r);
		await settle();
		await r.session.setKeep(false);
		expect(r.prefs.on).toBe(false);
		expect(r.session.state).toBe('off');
		expect(r.storage.records.size).toBe(0);
		expect(r.storage.blobs.size).toBe(0);
		expect(r.session.cards).toHaveLength(1);
		expect(r.session.cards[0]).toMatchObject({ open: true, saved: false });
		r.store.rotatePages([r.store.state.pages[0].id], 90);
		await settle();
		expect(r.storage.records.size).toBe(0);
		expect(r.session.safeToLeave).toBe(false);
		// Closing it loses it: there is no card left.
		const r2 = rig({ storage: r.storage, keep: false });
		await r2.session.init();
		expect(r2.session.state).toBe('off');
		expect(r2.session.cards).toEqual([]);
		// On again: this tab's open work is stored again.
		await r.session.setKeep(true);
		await settle();
		expect(r.session.state).toBe('saved');
		expect(parseRecord(r.storage.raw()).pages).toHaveLength(7);
	});

	it('Forget all my work deletes everything now and closes what is open; another tab stops saving its open work', async () => {
		const storage = memoryStorage();
		const channel = bus();
		const r = rig({ storage, channel });
		const other = rig({ storage, channel });
		await r.session.init();
		await other.session.init();
		buildWork(r);
		await settle();
		other.store.addSource(source('o', 1));
		await settle();
		expect(storage.records.size).toBe(2);
		expect(await r.session.forget()).toBe(true);
		expect(storage.records.size).toBe(0);
		expect(storage.blobs.size).toBe(0);
		expect(r.store.state.pages).toHaveLength(0);
		expect(r.session.cards).toEqual([]);
		// The other tab keeps what it has open, but it is not saved again.
		expect(other.session.state).toBe('forgotten');
		other.store.rotatePages([other.store.state.pages[0].id], 90);
		await settle();
		expect(storage.records.size).toBe(0);
		// New work here is saved.
		r.store.addSource(source('n', 1));
		await settle();
		expect(r.session.state).toBe('saved');
		expect(parseRecord(storage.raw()).sources.map((s) => s.id)).toEqual(['n']);
	});

	it('sweeps orphaned blobs, and blobs of files no longer used', async () => {
		const storage = memoryStorage();
		await storage.putBlob('f'.repeat(64), pdfBytes('stray'), 0);
		const r = rig({ storage, sweepGraceMs: 60_000 });
		await r.session.init();
		await settle(10);
		expect(storage.blobs.size).toBe(0);
		r.store.addSource(source('a', 1));
		r.store.addSource(source('b', 1));
		await settle();
		expect(storage.blobs.size).toBe(2);
		r.store.removePages([r.store.state.pages[1].id]);
		await settle();
		// Still reachable by undo: kept.
		expect(storage.blobs.size).toBe(2);
		r.session.sourceReleased('b');
		r.store.rotatePages([r.store.state.pages[0].id], 90);
		await settle();
		// This tab's own file goes at once, grace time or not.
		expect([...storage.blobs.keys()]).toEqual([await sha256Hex(pdfBytes('a'))]);
	});

	it('a file another tab has just stored for unsaved work is left alone for the grace time', async () => {
		const storage = memoryStorage();
		const t = Date.UTC(2026, 10, 12, 12);
		await storage.putBlob('e'.repeat(64), pdfBytes('fresh'), t - 1000);
		await storage.putBlob('d'.repeat(64), pdfBytes('old'), t - 3600_000);
		const r = rig({ storage, t, sweepGraceMs: 600_000 });
		await r.session.init();
		await settle(10);
		expect([...storage.blobs.keys()]).toEqual(['e'.repeat(64)]);
	});
});

describe('session: several pieces of work, one open', () => {
	it('new work after closing keeps the old one; both are cards; opening one loads exactly it', async () => {
		const r = rig();
		await r.session.init();
		buildWork(r);
		await settle();
		const first = snapshotDoc(r.store);
		const a = r.session.current!;
		await r.session.flush();
		expect(r.session.safeToLeave).toBe(true);
		r.session.close();
		expect(r.store.state.pages).toHaveLength(0);
		expect(r.session.current).toBeNull();
		expect(r.session.cards.map((c) => [c.id, c.open])).toEqual([[a, false]]);

		r.clock.t += 60_000;
		r.session.noteOpened(source('z', 2), { original: pdfBytes('z'), needsPassword: false });
		r.store.addSource(source('z', 2));
		await settle();
		const b = r.session.current!;
		expect(b).not.toBe(a);
		expect(r.storage.records.size).toBe(2);
		// The open one first, then the others, last edited first.
		expect(r.session.cards.map((c) => [c.name, c.open])).toEqual([
			['z.pdf', true],
			['a.pdf', false]
		]);
		const second = snapshotDoc(r.store);

		r.session.close();
		expect(await r.session.open(a, async () => null)).toEqual({ ok: true, skipped: 0 });
		expect(snapshotDoc(r.store)).toEqual(first);
		expect(r.session.cards.map((c) => [c.id, c.open])).toEqual([
			[a, true],
			[b, false]
		]);
		r.session.close();
		expect(await r.session.open(b, async () => null)).toEqual({ ok: true, skipped: 0 });
		expect(snapshotDoc(r.store)).toEqual(second);
		// Opening needs an empty workspace: the caller closes first.
		expect(await r.session.open(a, async () => null)).toEqual({ ok: false, reason: 'unavailable' });
	});

	it('forgetting one piece of work deletes it and the files only it used; shared files stay', async () => {
		const r = rig();
		await r.session.init();
		r.store.addSource(source('shared', 1));
		r.store.addSource(source('onlyA', 1));
		await settle();
		const a = r.session.current!;
		r.session.close();
		r.store.addSource(source('shared', 1));
		await settle();
		const b = r.session.current!;
		r.session.close();
		expect(r.storage.blobs.size).toBe(2);
		expect(await r.session.forgetProject(a)).toBe(true);
		expect([...r.storage.records.keys()]).toEqual([b]);
		expect([...r.storage.blobs.keys()]).toEqual([await sha256Hex(pdfBytes('shared'))]);
		expect(r.session.cards.map((c) => c.id)).toEqual([b]);
	});

	it('forgetting the open work closes it', async () => {
		const r = rig();
		await r.session.init();
		r.store.addSource(source('a', 1));
		await settle();
		const id = r.session.current!;
		r.store.rotatePages([r.store.state.pages[0].id], 90);
		await r.session.forgetProject(id);
		await settle();
		expect(r.store.state.pages).toHaveLength(0);
		expect(r.storage.records.size).toBe(0);
		expect(r.storage.blobs.size).toBe(0);
		expect(r.session.cards).toEqual([]);
	});

	it('Start over: the emptied work is hidden, deleted after the undo window, or at once when other work is opened', async () => {
		const r = rig();
		await r.session.init();
		r.store.addSource(source('a', 2));
		await settle();
		r.store.clear();
		await settle(500);
		expect(r.storage.records.size).toBe(1);
		expect(r.session.cards).toEqual([]);
		r.store.undo();
		await settle(2000);
		expect(r.storage.records.size).toBe(1);
		r.store.clear();
		await settle(1500);
		expect(r.storage.records.size).toBe(0);

		r.store.addSource(source('b', 1));
		await settle();
		expect(r.storage.records.size).toBe(1);
		r.store.clear();
		await settle(100);
		// New work started before the undo window ends: the emptied work goes now.
		r.session.close();
		await settle(10);
		expect(r.storage.records.size).toBe(0);
	});

	it('two tabs: work open in one is marked in the other and cannot be opened or forgotten there', async () => {
		const storage = memoryStorage();
		const house = lockHouse();
		const channel = bus();
		const a = rig({ storage, house, channel, writer: 'A' });
		await a.session.init();
		a.store.addSource(source('a', 1));
		await settle();
		const p = a.session.current!;
		expect(house.held.get(p)).toBe('A');

		const b = rig({ storage, house, channel, writer: 'B' });
		await b.session.init();
		expect(b.session.cards).toEqual([expect.objectContaining({ id: p, elsewhere: true })]);
		expect(await b.session.open(p, async () => null)).toEqual({ ok: false, reason: 'elsewhere' });
		expect(await b.session.forgetProject(p)).toBe(false);
		expect(storage.records.has(p)).toBe(true);
		// B's own new work is saved beside it, and A hears about it.
		b.store.addSource(source('b', 1));
		await settle(700);
		expect(storage.records.size).toBe(2);
		expect(a.session.cards.map((c) => c.name).sort()).toEqual(['a.pdf', 'b.pdf']);
		// A closes it: B may open it now.
		a.session.close();
		expect(house.held.has(p)).toBe(false);
		await b.session.refresh();
		expect(b.session.cards.find((c) => c.id === p)?.elsewhere).toBe(false);
		b.session.close();
		expect((await b.session.open(p, async () => null)).ok).toBe(true);
	});

	it('without locks, a stale writer never overwrites another tab', async () => {
		const storage = memoryStorage();
		const a = rig({ storage, writer: 'A' });
		await a.session.init();
		a.store.addSource(source('a', 1));
		await settle();
		const p = a.session.current!;
		const c = rig({ storage, writer: 'C' });
		await c.session.init();
		expect((await c.session.open(p, async () => null)).ok).toBe(true);
		a.store.rotatePages([a.store.state.pages[0].id], 90);
		await settle();
		c.store.rotatePages([c.store.state.pages[0].id], 180);
		await settle();
		expect(c.session.state).toBe('other-tab');
		expect(parseRecord(storage.records.get(p)).writer).toBe('A');
		expect(parseRecord(storage.records.get(p)).pages[0].rotation).toBe(90);
	});

	it('the single saved work of the version before becomes the first card, unchanged', async () => {
		const r = rig();
		await r.session.init();
		buildWork(r);
		await settle();
		const before = snapshotDoc(r.store);
		// Lay it out as version 1 did: one record under "current".
		const old = r.storage.raw();
		r.storage.records.clear();
		r.storage.setLegacy(old);
		const r2 = rig({ storage: r.storage });
		await r2.session.init();
		await settle(10);
		expect(r.storage.legacy()).toBeUndefined();
		const id = onlyCard(r2);
		expect(r2.session.cards[0]).toMatchObject({ name: 'a.pdf', files: 2, pages: 7, thumb: null });
		// Its files were not swept while it moved.
		expect(r.storage.blobs.size).toBe(4);
		expect(await r2.session.open(id, async () => null)).toEqual({ ok: true, skipped: 0 });
		expect(snapshotDoc(r2.store)).toEqual(before);
	});

	it('at most maxProjects are kept: the next is not saved and nothing is deleted; forgetting one makes room', async () => {
		const r = rig({ maxProjects: 2 });
		await r.session.init();
		for (const n of ['a', 'b']) {
			r.store.addSource(source(n, 1));
			await settle();
			r.session.close();
		}
		expect(r.storage.records.size).toBe(2);
		r.session.noteOpened(source('c', 1), { original: pdfBytes('c'), needsPassword: false });
		r.store.addSource(source('c', 1));
		await settle();
		expect(r.session.state).toBe('limit');
		expect(r.session.line).toContain('Up to 12 pieces of work');
		expect(r.storage.records.size).toBe(2);
		// The opened file was not stored either.
		expect(r.storage.blobs.size).toBe(2);
		expect(r.session.safeToLeave).toBe(false);
		const oldest = [...r.session.cards].filter((x) => !x.open).sort((x, y) => x.savedAt - y.savedAt)[0];
		await r.session.forgetProject(oldest.id);
		await r.session.retry();
		await settle();
		expect(r.session.state).toBe('saved');
		expect(r.storage.records.size).toBe(2);
		expect(r.session.cards.map((x) => x.name).sort()).toEqual(['b.pdf', 'c.pdf']);
	});

	it('at most maxTotalBytes are stored: the next file is refused plainly, never by deleting other work', async () => {
		const r = rig({ maxTotalBytes: 100 });
		await r.session.init();
		r.store.addSource(source('a', 1));
		await settle();
		r.session.close();
		r.store.addSource(source('b', 1));
		await settle();
		expect(r.session.state).toBe('full');
		expect(r.storage.records.size).toBe(1);
		await r.session.forgetProject(r.session.cards.find((c) => !c.open)!.id);
		await r.session.retry();
		await settle();
		expect(r.session.state).toBe('saved');
		expect(parseRecord(r.storage.raw()).sources.map((s) => s.id)).toEqual(['b']);
	});

	it('the first page picture is made, stored with saved work, and made again when the first page changes', async () => {
		const made: string[] = [];
		const thumbnail = async (st: DocState) => {
			made.push(`${st.pages[0].sourceId}:${st.pages[0].rotation}`);
			return new Blob([made.at(-1)!], { type: 'image/jpeg' });
		};
		const r = rig({ thumbnail });
		await r.session.init();
		r.store.addSource(source('a', 2));
		await settle(1000);
		const id = r.session.current!;
		expect(made).toEqual(['a:0']);
		expect(await r.storage.thumbs.get(id)?.text()).toBe('a:0');
		expect(await r.session.cards[0].thumb?.text()).toBe('a:0');
		// A change elsewhere does not make a new one.
		r.store.rotatePages([r.store.state.pages[1].id], 90);
		await settle(1000);
		expect(made).toEqual(['a:0']);
		r.store.rotatePages([r.store.state.pages[0].id], 90);
		await settle(1000);
		expect(made).toEqual(['a:0', 'a:90']);
		expect(await r.storage.thumbs.get(id)?.text()).toBe('a:90');
		r.session.close();
		expect(await r.session.cards[0].thumb?.text()).toBe('a:90');
		// Forgotten work takes its picture with it.
		await r.session.forgetProject(id);
		expect(r.storage.thumbs.size).toBe(0);
	});
});

describe('session: passwords', () => {
	it('password-protected files: stored as given, password asked again, skipping keeps a consistent piece of work', async () => {
		const r = rig();
		await r.session.init();
		const original = pdfBytes('ENCRYPTED-ORIGINAL', 80);
		const prot: Source = { ...source('p', 2), wasEncrypted: true, bytes: pdfBytes('DECRYPTED-SECRET'), limits: { password: true, print: true, copy: true, edit: false, fill: false } };
		r.session.noteOpened(prot, { original, needsPassword: true });
		r.store.addSource(prot);
		r.store.addSource(source('a', 1));
		r.store.addAsset(asset('sig'));
		r.store.addStamp(r.store.state.pages[0].id, { kind: 'image', assetId: 'sig', box: { x: 0.1, y: 0.1, w: 0.2, h: 0.1 } });
		r.store.setFormValue('p', 'f', 'x');
		await settle();
		const rec = parseRecord(r.storage.raw());
		const p = rec.sources.find((s) => s.id === 'p')!;
		expect(p.stored).toBe('original');
		expect(p.needsPassword).toBe(true);
		expect(p.hash).toBe(await sha256Hex(original));
		// What the file limited is derived when it opens, never stored.
		expect(JSON.stringify(r.storage.raw())).not.toContain('limits');
		// The decrypted bytes are stored nowhere.
		for (const b of r.storage.blobs.values()) expect(new TextDecoder().decode(b)).not.toContain('DECRYPTED-SECRET');

		// Open: wrong, then right.
		const r2 = rig({ storage: r.storage });
		await r2.session.init();
		expect(r2.session.cards[0].needsPassword).toBe(true);
		const asks: (string | undefined)[] = [];
		const answers = ['nope', 'secret'];
		const res = await r2.session.open(onlyCard(r2), async (a) => {
			asks.push(a.error);
			return answers.shift()!;
		});
		expect(res).toEqual({ ok: true, skipped: 0 });
		expect(asks).toEqual([undefined, 'That password did not open the file. Check it and try again.']);
		expect(r2.store.state.pages.map((x) => x.sourceId)).toEqual(['p', 'p', 'a']);
		expect(r2.store.state.sources[0].limits).toEqual({ password: true, print: true, copy: true, edit: false, fill: false });
		expect(r2.store.state.formValues).toEqual({ p: { f: 'x' } });

		// Open again, skipping the protected file: its pages, answers and stamps go; the rest is whole.
		const r3 = rig({ storage: r.storage });
		await r3.session.init();
		const res3 = await r3.session.open(onlyCard(r3), async () => null);
		expect(res3).toEqual({ ok: true, skipped: 1 });
		expect(r3.store.state.pages.map((x) => x.sourceId)).toEqual(['a']);
		expect(r3.store.state.formValues).toEqual({});
		expect(r3.store.state.assets).toEqual([]);
		await settle();
		expect(parseRecord(r.storage.raw()).sources.map((s) => s.id)).toEqual(['a']);
		expect(r.storage.records.size).toBe(1);
	});

	it('skipping the only file opens nothing and keeps the work saved', async () => {
		const r = rig();
		await r.session.init();
		const prot: Source = { ...source('p', 2), wasEncrypted: true };
		r.session.noteOpened(prot, { original: pdfBytes('ENC'), needsPassword: true });
		r.store.addSource(prot);
		await settle();
		const r2 = rig({ storage: r.storage });
		await r2.session.init();
		expect(await r2.session.open(onlyCard(r2), async () => null)).toEqual({ ok: false, reason: 'skipped' });
		expect(r2.session.cards).toHaveLength(1);
		expect(r2.store.state.pages).toHaveLength(0);
		expect(r.storage.records.size).toBe(1);
	});

	it('a reopened protected file with different pages is refused', async () => {
		const r = rig();
		await r.session.init();
		const prot: Source = { ...source('p', 3), wasEncrypted: true };
		r.session.noteOpened(prot, { original: pdfBytes('ENC'), needsPassword: true });
		r.store.addSource(prot);
		await settle();
		const r2 = rig({ storage: r.storage });
		await r2.session.init();
		// fakeEngine reopens with 2 pages: does not match the 3 saved.
		expect(await r2.session.open(onlyCard(r2), async () => 'secret')).toEqual({ ok: false, reason: 'broken' });
		expect(r2.store.state.pages).toHaveLength(0);
	});
});
