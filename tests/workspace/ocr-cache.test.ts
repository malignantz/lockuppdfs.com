import { describe, expect, it } from 'vitest';
import { OCR_PIPELINE_VERSION } from '../../src/lib/engine/ocr/stage';
import { MEMORY_PAGES, OCR_READ_VERSION, OcrCache } from '../../src/lib/workspace/ocr-cache';
import { OCR_MAX_ROWS, memoryStorage } from '../../src/lib/session/storage';
import { ScanQueue } from '../../src/lib/editor/scan-queue';
import type { OcrKnownPage, Source } from '../../src/lib/core/types';

const src = (id: string, bytes = id): Source => ({ id, kind: 'pdf', name: `${id}.pdf`, bytes: new TextEncoder().encode(bytes), pages: [] }) as unknown as Source;
const read = (s: Source, pageIndex: number, outcome: unknown = { ok: true, read: { words: pageIndex } }, version: number | null = OCR_READ_VERSION): OcrKnownPage => ({
	sourceId: s.id,
	pageIndex,
	outcome,
	...(version === null ? {} : { version })
});
/** Timers that run only when asked. */
function timers() {
	const due: (() => void)[] = [];
	return { setTimeout: (fn: () => void) => void due.push(fn), run: () => due.splice(0).forEach((f) => f()) };
}

describe('OCR cache', () => {
	it('uses the engine pipeline version', () => {
		expect(OCR_READ_VERSION).toBe(OCR_PIPELINE_VERSION);
	});

	it('hits by file content and page, not by source id; misses other bytes and other pages', async () => {
		const c = new OcrCache();
		const a = src('a', 'same bytes');
		await c.add(a, [read(a, 2)]);
		expect(await c.get(a, 2)).toEqual({ sourceId: 'a', pageIndex: 2, outcome: { ok: true, read: { words: 2 } }, version: OCR_READ_VERSION });
		expect(await c.get(a, 3)).toBeNull();
		// The same file opened again (another source id) hits; another file misses.
		expect((await c.get(src('a2', 'same bytes'), 2))?.sourceId).toBe('a2');
		expect(await c.get(src('b', 'other bytes'), 2)).toBeNull();
		// Image sources are never kept.
		expect(await c.get({ ...a, id: 'img', kind: 'image' } as Source, 2)).toBeNull();
	});

	it('keeps declines with their reason, but not failed readings or other versions', async () => {
		const c = new OcrCache();
		const a = src('a');
		await c.add(a, [read(a, 0, { ok: false, why: 'gate' }), read(a, 1, { ok: false, why: 'failed' }, null), read(a, 2, { ok: true }, OCR_READ_VERSION + 1)]);
		expect((await c.get(a, 0))?.outcome).toEqual({ ok: false, why: 'gate' });
		expect(await c.get(a, 1)).toBeNull();
		expect(await c.get(a, 2)).toBeNull();
	});

	it('gives an export the kept readings of its pages, each source page once', async () => {
		const c = new OcrCache();
		const a = src('a');
		const b = src('b');
		await c.add(a, [read(a, 0), read(a, 4)]);
		await c.addAll([a, b], [read(b, 1), read(a, 9)]);
		const pages = [0, 0, 1, 4, 9].map((pageIndex) => ({ sourceId: 'a', pageIndex })).concat([{ sourceId: 'b', pageIndex: 1 }]);
		expect((await c.knownFor([a, b], pages)).map((k) => `${k.sourceId}:${k.pageIndex}`)).toEqual(['a:0', 'a:4', 'a:9', 'b:1']);
	});

	it('keeps at most MEMORY_PAGES pages in memory', async () => {
		const c = new OcrCache();
		const a = src('a');
		await c.add(a, Array.from({ length: MEMORY_PAGES + 5 }, (_, i) => read(a, i)));
		expect(c.size).toBe(MEMORY_PAGES);
		expect(await c.get(a, 0)).toBeNull();
		expect(await c.get(a, MEMORY_PAGES + 4)).not.toBeNull();
	});

	it('writes readings with saved work once the file is stored, and reads them back in a new visit', async () => {
		const store = memoryStorage();
		const t = timers();
		const a = src('a');
		const c = new OcrCache({ store: () => store, hash: async (b) => new TextDecoder().decode(b), ...t });
		await c.add(a, [read(a, 0), read(a, 1, { ok: false, why: 'orientation' })]);
		// The file is not stored yet: nothing written, tried again later.
		expect(store.ocr.size).toBe(0);
		await store.putBlob('a', new Uint8Array([1]), 0);
		t.run();
		await new Promise((r) => setTimeout(r, 0));
		expect(store.ocr.size).toBe(2);
		// A new visit (a fresh cache) reads them from the store.
		const next = new OcrCache({ store: () => store, hash: async (b) => new TextDecoder().decode(b) });
		expect((await next.get(src('again', 'a'), 1))?.outcome).toEqual({ ok: false, why: 'orientation' });
		// Work not saved on this device: memory only.
		const off = new OcrCache({ store: () => null });
		await off.add(a, [read(a, 3)]);
		expect(store.ocr.size).toBe(2);
	});
});

describe('OCR rows in the session storage', () => {
	it('are written only for a stored file, deleted with it (sweep, deleteBlobs, clear), versions replaced, capped', async () => {
		const s = memoryStorage();
		expect(await s.putOcr('h1', 1, [{ pageIndex: 0, outcome: 'x' }], 1)).toBe(false);
		await s.putBlob('h1', new Uint8Array([1]), 0);
		await s.putBlob('h2', new Uint8Array([2]), 0);
		expect(await s.putOcr('h1', 1, [{ pageIndex: 0, outcome: 'x' }, { pageIndex: 1, outcome: 'y' }], 1)).toBe(true);
		expect(await s.putOcr('h2', 1, [{ pageIndex: 0, outcome: 'z' }], 1)).toBe(true);
		expect(await s.getOcr('h1', 1)).toEqual([
			{ pageIndex: 0, outcome: 'x' },
			{ pageIndex: 1, outcome: 'y' }
		]);
		// A new pipeline version: the old rows of that file are of no use and go.
		expect(await s.putOcr('h1', 2, [{ pageIndex: 0, outcome: 'x2' }], 2)).toBe(true);
		expect(await s.getOcr('h1', 1)).toEqual([]);
		expect(await s.getOcr('h1', 2)).toEqual([{ pageIndex: 0, outcome: 'x2' }]);
		// Swept with its file (no saved work names it).
		await s.sweep(new Set(['h2']), () => [], Infinity);
		expect(await s.getOcr('h1', 2)).toEqual([]);
		expect(await s.getOcr('h2', 1)).toHaveLength(1);
		await s.deleteBlobs(['h2']);
		expect(s.ocr.size).toBe(0);
		await s.putBlob('h3', new Uint8Array([3]), 0);
		await s.putOcr('h3', 1, [{ pageIndex: 0, outcome: 1 }], 1);
		await s.clear();
		expect(s.ocr.size).toBe(0);
	});

	it('keeps at most OCR_MAX_ROWS rows, the oldest going first', async () => {
		const s = memoryStorage();
		await s.putBlob('h', new Uint8Array([1]), 0);
		await s.putOcr('h', 1, [{ pageIndex: 0, outcome: 'old' }], 1);
		await s.putOcr('h', 1, Array.from({ length: OCR_MAX_ROWS }, (_, i) => ({ pageIndex: i + 1, outcome: i })), 2);
		expect(s.ocr.size).toBe(OCR_MAX_ROWS);
		expect((await s.getOcr('h', 1)).some((r) => r.outcome === 'old')).toBe(false);
	});
});

describe('scan queue with kept readings', () => {
	it('wants every qualifying page with a kept reading, beyond the window', () => {
		const q = new ScanQueue<number>({ autoAll: 2, autoFirst: 1, ahead: 1, maxDocPages: 300, maxFileBytes: 1e9, keep: 200 });
		const keys = ['s:0', 's:1', 's:2', 's:3', 's:4'];
		q.setDocument({ all: keys, eligible: keys, unlisted: new Set() });
		expect(q.order()).toEqual(['s:0']);
		q.setCached(['s:3', 's:4', 'x:9']);
		expect(q.order()).toEqual(['s:0', 's:3', 's:4']);
	});
});
