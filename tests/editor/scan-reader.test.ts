/**
 * The background reader's scheduling (editor/scan-reader.svelte.ts) with a fake engine
 * and fake timers: what it reads, in what order, when it waits, how it stops.
 */
import { describe, expect, it } from 'vitest';
import { ScanReader, DONE_FIRST_NOTICE, DONE_NOTICE } from '../../src/lib/editor/scan-reader.svelte';
import type { EngineClient } from '../../src/lib/engine/client';
import type { OcrKnownPage, PageRef, ScanPageRead, Source } from '../../src/lib/core/types';
import { OCR_READ_VERSION, OcrCache } from '../../src/lib/workspace/ocr-cache';

const cfg = { autoAll: 4, autoFirst: 2, ahead: 1, maxDocPages: 50, maxFileBytes: 1000, keep: 50 };

function src(id: string, n: number, bytes = 1): Source {
	return { id, kind: 'pdf', name: `${id}.pdf`, bytes: new Uint8Array(bytes), pages: Array.from({ length: n }, () => ({ width: 612, height: 792 })) } as unknown as Source;
}
const refs = (s: Source, idx = s.pages.map((_, i) => i)): PageRef[] => idx.map((i) => ({ id: `${s.id}-${i}`, sourceId: s.id, pageIndex: i, rotation: 0, stamps: [] }));

interface Call {
	key: string;
	reuse?: OcrKnownPage;
	resolve: (r: ScanPageRead) => void;
	reject: (e: unknown) => void;
}

function harness(eligible: Record<string, number[]>, cache = new OcrCache({ hash: async (b) => `bytes-${b.length}` })) {
	const timers: { fn: () => void; at: number }[] = [];
	let clock = 0;
	const calls: Call[] = [];
	const engines: { terminated: boolean }[] = [];
	const notes: string[] = [];
	const make = (): EngineClient => {
		const me = { terminated: false };
		engines.push(me);
		return {
			scannedPages: async (s: Source) => eligible[s.id] ?? [],
			readScanPage: (s: Source, i: number, reuse?: OcrKnownPage) =>
				new Promise<ScanPageRead>((resolve, reject) => {
					if (me.terminated) return reject(new Error('stopped'));
					calls.push({ key: `${s.id}:${i}`, reuse, resolve, reject });
				}),
			terminate: () => {
				me.terminated = true;
				for (const c of calls.splice(0)) c.reject(new Error('stopped'));
			}
		} as unknown as EngineClient;
	};
	const reader = new ScanReader({
		createEngine: make,
		cache,
		enabled: () => true,
		config: cfg,
		notify: (m) => notes.push(m),
		now: () => clock,
		setTimeout: (fn, ms) => {
			const t = { fn, at: clock + ms };
			timers.push(t);
			return t;
		},
		clearTimeout: (t) => {
			const i = timers.indexOf(t as (typeof timers)[number]);
			if (i >= 0) timers.splice(i, 1);
		}
	});
	/** Lets promises settle and runs due timers, `ms` later. */
	const advance = async (ms = 0) => {
		clock += ms;
		for (let round = 0; round < 20; round++) {
			await new Promise((r) => setImmediate(r));
			const due = timers.filter((t) => t.at <= clock);
			if (!due.length) continue;
			for (const t of due) timers.splice(timers.indexOf(t), 1);
			for (const t of due) t.fn();
		}
	};
	const answer = async (words: number, ms = 6000, version?: number) => {
		const c = calls.shift()!;
		clock += ms;
		c.resolve({
			text: { words: Array.from({ length: words }, (_, i) => ({ text: `w${i}`, box: { x: 0, y: 0, w: 0.1, h: 0.1 }, line: 0 })), skipped: 0 },
			reuse: { sourceId: c.key.split(':')[0], pageIndex: Number(c.key.split(':')[1]), outcome: { ok: words > 0 }, ...(version ? { version } : {}) },
			ms
		});
		await advance();
		await advance(400);
		return c.key;
	};
	return { reader, calls, engines, notes, advance, answer, cache };
}

describe('ScanReader', () => {
	it('reads a short scan whole as soon as it is added, the viewed page first, then says so once', async () => {
		const h = harness({ a: [0, 1, 3] });
		const a = src('a', 4);
		h.reader.sync([a], refs(a));
		await h.advance();
		expect(h.calls.map((c) => c.key)).toEqual(['a:0']);
		expect(h.reader.page('a', 0).state).toBe('reading');
		expect(h.reader.page('a', 2).state).toBe('none');
		h.reader.view('a', 3);
		expect(await h.answer(5)).toBe('a:0');
		expect(await h.answer(5)).toBe('a:3');
		expect(h.notes).toEqual([]);
		expect(await h.answer(0)).toBe('a:1');
		expect(h.reader.page('a', 3)).toMatchObject({ state: 'done' });
		expect(h.reader.page('a', 1).text?.words).toEqual([]);
		expect(h.notes).toEqual([DONE_NOTICE]);
		expect(h.reader.known().map((k) => k.pageIndex).sort()).toEqual([0, 1, 3]);
		// Once per file: a change to the document does not say it again.
		h.reader.sync([a], refs(a, [3, 0, 1, 2]));
		await h.advance(1000);
		expect(h.notes).toEqual([DONE_NOTICE]);
	});

	it('nothing is read while held (an export, a hidden tab); it goes on after', async () => {
		const h = harness({ a: [0, 1] });
		const a = src('a', 2);
		h.reader.hold('export', true);
		h.reader.sync([a], refs(a));
		await h.advance(5000);
		expect(h.calls).toEqual([]);
		h.reader.hold('hidden', true);
		h.reader.hold('export', false);
		await h.advance(5000);
		expect(h.calls).toEqual([]);
		h.reader.hold('hidden', false);
		await h.advance();
		expect(h.calls.map((c) => c.key)).toEqual(['a:0']);
		// Held while a page is in flight: that page finishes, the next waits.
		h.reader.hold('export', true);
		await h.answer(3);
		expect(h.calls).toEqual([]);
		h.reader.hold('export', false);
		await h.advance();
		expect(h.calls.map((c) => c.key)).toEqual(['a:1']);
	});

	it('a file removed while its page is read: that reading is stopped and dropped; the rest goes on', async () => {
		const h = harness({ a: [0], b: [0, 1] });
		const a = src('a', 1);
		const b = src('b', 2);
		h.reader.sync([a, b], [...refs(a), ...refs(b)]);
		await h.advance();
		expect(h.calls.map((c) => c.key)).toEqual(['a:0']);
		h.reader.sync([b], refs(b));
		expect(h.engines[0].terminated).toBe(true);
		await h.advance();
		expect(h.reader.page('a', 0).state).toBe('none');
		expect(h.calls.map((c) => c.key)).toEqual(['b:0']);
		expect(h.engines.length).toBe(2);
	});

	it('closing the document stops the worker at once', async () => {
		const h = harness({ a: [0, 1] });
		const a = src('a', 2);
		h.reader.sync([a], refs(a));
		await h.advance();
		h.reader.sync([], []);
		expect(h.engines[0].terminated).toBe(true);
		await h.advance(60_000);
		expect(h.calls).toEqual([]);
	});

	it('the worker is stopped when there is nothing left to read for a while', async () => {
		const h = harness({ a: [0] });
		const a = src('a', 1);
		h.reader.sync([a], refs(a));
		await h.advance();
		await h.answer(2);
		expect(h.engines[0].terminated).toBe(false);
		await h.advance(1000);
		await h.advance(31_000);
		expect(h.engines[0].terminated).toBe(true);
	});

	it('a long scan: first pages, then the viewed one and the next; pages with redaction boxes are not read', async () => {
		const h = harness({ a: [0, 1, 2, 3, 4, 5, 6, 7] });
		const a = src('a', 8);
		const pages = refs(a);
		pages[5] = { ...pages[5], stamps: [{ kind: 'redact' } as never] };
		h.reader.sync([a], pages);
		await h.advance();
		await h.answer(1);
		await h.answer(1);
		expect(h.calls).toEqual([]);
		// Only the first pages were read: the notice says so.
		expect(h.notes).toEqual([DONE_FIRST_NOTICE]);
		h.reader.view('a', 4);
		await h.advance();
		expect(await h.answer(1)).toBe('a:4');
		// The page after it has a redaction box: the next one after that.
		expect(await h.answer(1)).toBe('a:6');
		expect(h.calls).toEqual([]);
	});

	it('the wait: pages done of the reading, the time once a page was timed, a bar only for a long wait', async () => {
		const h = harness({ a: [0, 1, 2] });
		const a = src('a', 3);
		h.reader.sync([a], refs(a));
		h.reader.view('a', 2);
		await h.advance();
		// Nothing timed yet: no time, but a long expected wait (two pages).
		expect(h.reader.wait('a', 2)).toEqual({ done: 0, total: 3, ms: null, long: true });
		expect(await h.answer(4, 6000)).toBe('a:2');
		expect(h.reader.wait('a', 2)).toBeNull();
		const w = h.reader.wait('a', 1)!;
		expect(w.done).toBe(1);
		expect(w.total).toBe(3);
		expect(w.ms).toBeGreaterThan(5000);
	});

	it('a very long file is read only where the editor looks', async () => {
		const h = harness({});
		const big = src('big', 400);
		h.reader.sync([big], refs(big));
		await h.advance(1000);
		expect(h.calls).toEqual([]);
		h.reader.view('big', 120);
		await h.advance();
		expect(h.calls.map((c) => c.key)).toEqual(['big:120']);
	});

	it('a file too large to copy into the reading worker is not read at all', async () => {
		const h = harness({ huge: [0, 1] });
		const huge = src('huge', 2, 5000);
		h.reader.sync([huge], refs(huge));
		h.reader.view('huge', 0);
		await h.advance(1000);
		expect(h.calls).toEqual([]);
		expect(h.engines.length).toBe(0);
		expect(h.reader.page('huge', 0).state).toBe('none');
	});

	it('passes a kept reading to the engine, keeps what it reads, and wants every page read before (the OCR cache)', async () => {
		const cache = new OcrCache({ hash: async (b) => `bytes-${b.length}` });
		const big = src('big', 12, 7);
		// Pages 9 and 11 were read before (by an export, or in an earlier visit).
		await cache.add(big, [9, 11].map((pageIndex) => ({ sourceId: 'big', pageIndex, outcome: { ok: true }, version: OCR_READ_VERSION })));
		const h = harness({ big: Array.from({ length: 12 }, (_, i) => i) }, cache);
		h.reader.sync([big], refs(big));
		await h.advance();
		// The first two (autoFirst), then the kept ones beyond the window.
		expect(h.calls[0].key).toBe('big:0');
		expect(h.calls[0].reuse).toBeUndefined();
		await h.answer(3, 6000, OCR_READ_VERSION);
		expect(await cache.get(big, 0)).not.toBeNull();
		await h.answer(3, 6000, OCR_READ_VERSION);
		expect(h.calls[0].key).toBe('big:9');
		expect(h.calls[0].reuse).toMatchObject({ pageIndex: 9, version: OCR_READ_VERSION });
		await h.answer(3, 0);
		expect(h.calls[0].key).toBe('big:11');
	});

	it('does nothing where it is not enabled (phones)', async () => {
		let made = 0;
		const reader = new ScanReader({ createEngine: () => (made++, {} as EngineClient), enabled: () => false });
		const a = src('a', 2);
		reader.sync([a], refs(a));
		reader.view('a', 0);
		await new Promise((r) => setTimeout(r, 20));
		expect(made).toBe(0);
		expect(reader.page('a', 0).state).toBe('none');
	});
});
