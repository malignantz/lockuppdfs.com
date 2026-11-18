/**
 * The document reader (find/doc-text.svelte.ts) with a fake engine and timers: when it
 * starts, what order it reads in, the caps, holds, and what Find is offered on.
 */
import { describe, expect, it } from 'vitest';
import type { PageRef, PageText, Source } from '../../src/lib/core/types';
import { DocText, linesOf } from '../../src/lib/find/doc-text.svelte';
import { findStatus } from '../../src/lib/find/status';

let n = 0;
function src(pages: number, kind: Source['kind'] = 'pdf'): Source {
	n++;
	return { id: `s${n}`, kind, name: `s${n}.pdf`, bytes: new Uint8Array(1), pages: Array.from({ length: pages }, () => ({ width: 612, height: 792 })) } as unknown as Source;
}
const refs = (s: Source, idx = s.pages.map((_, i) => i)): PageRef[] => idx.map((i) => ({ id: `${s.id}-${i}-${Math.random()}`, sourceId: s.id, pageIndex: i, rotation: 0, stamps: [] }));
const words = (t: string): PageText => ({ skipped: 0, words: t ? t.split(' ').map((w, i) => ({ text: w, line: 0, box: { x: 0.1 + i * 0.1, y: 0.1, w: 0.08, h: 0.02 } })) : [] });

function harness(opts: { eager?: boolean; text?: (s: Source, i: number) => string; pageCap?: number; charCap?: number } = {}) {
	const timers: (() => void)[] = [];
	const calls: string[] = [];
	const engine = {
		pageText: async (s: Source, i: number) => {
			calls.push(`${s.id}:${i}`);
			if (opts.text?.(s, i) === 'FAIL') throw new Error('no');
			return words(opts.text ? opts.text(s, i) : `page ${i}`);
		}
	};
	const dt = new DocText({
		engine,
		eager: () => opts.eager ?? true,
		idle: (fn) => fn(),
		setTimeout: (fn) => (timers.push(fn), timers.length),
		clearTimeout: () => undefined,
		pageCap: opts.pageCap,
		charCap: opts.charCap
	});
	/** Run timers until nothing is left (each read settles in a microtask). */
	const settle = async () => {
		for (let k = 0; k < 500; k++) {
			await new Promise((r) => setTimeout(r, 0));
			const fn = timers.shift();
			if (!fn) {
				await new Promise((r) => setTimeout(r, 0));
				if (!timers.length) return;
				continue;
			}
			fn();
		}
	};
	return { dt, calls, settle };
}

describe('DocText', () => {
	it('reads every page of a document on a desktop, a file’s pages together, each once', async () => {
		const { dt, calls, settle } = harness();
		const a = src(3);
		const b = src(2);
		const img = src(1, 'image');
		const [a0, a1, a2] = refs(a);
		const [b0, b1] = refs(b);
		// Interleaved, one page twice, a picture.
		const pages = [a0, b0, a1, ...refs(img), b1, a2, { ...a1, id: 'dup' }];
		dt.sync([a, b, img], pages);
		await settle();
		expect(calls).toEqual([`${a.id}:0`, `${a.id}:1`, `${a.id}:2`, `${b.id}:0`, `${b.id}:1`]);
		expect(dt.progress).toEqual({ done: 5, total: 5 });
		expect(dt.complete).toBe(true);
		expect(dt.hasText).toBe(true);
		expect(dt.offer).toBe(true);
		expect(linesOf(dt, a, a1).map((l) => l.text)).toEqual(['page 1']);
		expect(linesOf(dt, img, pages[3])).toEqual([]);
	});

	it('reads nothing on a phone until start()', async () => {
		const { dt, calls, settle } = harness({ eager: false });
		const a = src(2);
		dt.sync([a], refs(a));
		await settle();
		expect(calls).toEqual([]);
		// Offered for a PDF before anything is known.
		expect(dt.offer).toBe(true);
		dt.start();
		await settle();
		expect(calls).toHaveLength(2);
	});

	it('stops offering Find once a phone has read a document with no text', async () => {
		const { dt, settle } = harness({ eager: false, text: () => '' });
		const a = src(2);
		dt.sync([a], refs(a));
		dt.start();
		await settle();
		expect(dt.complete).toBe(true);
		expect(dt.hasText).toBe(false);
		expect(dt.offer).toBe(false);
	});

	it('does not offer Find on a desktop until a page with text is found', async () => {
		const { dt, settle } = harness({ text: (_, i) => (i === 2 ? 'words here' : '') });
		const a = src(3);
		dt.sync([a], refs(a));
		expect(dt.offer).toBe(false);
		await settle();
		expect(dt.offer).toBe(true);
	});

	it('never offers Find for pictures and blank pages', async () => {
		const { dt, settle } = harness({ eager: false });
		const img = src(2, 'image');
		dt.sync([img], refs(img));
		await settle();
		expect(dt.hasPdfPages).toBe(false);
		expect(dt.offer).toBe(false);
	});

	it('reads only the first pages past the page cap', async () => {
		const { dt, calls, settle } = harness({ pageCap: 3 });
		const a = src(5);
		dt.sync([a], refs(a));
		await settle();
		expect(calls).toEqual([`${a.id}:0`, `${a.id}:1`, `${a.id}:2`]);
		expect(dt.skipped).toBe(2);
	});

	it('stops reading once the character cap is passed', async () => {
		const { dt, calls, settle } = harness({ charCap: 10 });
		const a = src(5);
		dt.sync([a], refs(a));
		await settle();
		// "page 0 " is 7 characters: the second page passes 10.
		expect(calls).toEqual([`${a.id}:0`, `${a.id}:1`]);
		expect(dt.skipped).toBe(3);
	});

	it('waits while held (an export, a hidden tab) and goes on after', async () => {
		const { dt, calls, settle } = harness();
		const a = src(2);
		dt.hold('export', true);
		dt.sync([a], refs(a));
		await settle();
		expect(calls).toEqual([]);
		dt.hold('export', false);
		await settle();
		expect(calls).toHaveLength(2);
	});

	it('counts a page it could not read as done and does not ask again', async () => {
		const { dt, calls, settle } = harness({ text: (_, i) => (i === 0 ? 'FAIL' : 'ok') });
		const a = src(2);
		dt.sync([a], refs(a));
		await settle();
		dt.sync([a], refs(a));
		await settle();
		expect(calls).toEqual([`${a.id}:0`, `${a.id}:1`]);
		expect(dt.complete).toBe(true);
	});
});

describe('findStatus', () => {
	const base = { query: 'total', hits: 12, truncated: false, current: -1, pages: 4, reading: null, noText: false, skipped: 0 };

	it('counts matches and pages', () => {
		expect(findStatus(base)).toEqual({ count: '12 matches', where: 'on 4 pages', said: '12 matches on 4 pages', note: '' });
		expect(findStatus({ ...base, current: 2 })).toMatchObject({ count: '3 of 12', said: '3 of 12 matches on 4 pages' });
		expect(findStatus({ ...base, hits: 1, pages: 1, current: 0 })).toMatchObject({ count: '1 of 1', where: 'on 1 page' });
		expect(findStatus({ ...base, hits: 5000, truncated: true }).count).toBe('more than 5,000 matches');
	});

	it('says when nothing matches, and while pages are still read', () => {
		expect(findStatus({ ...base, hits: 0, pages: 0 })).toMatchObject({ count: 'No matches', said: 'No matches', note: '' });
		expect(findStatus({ ...base, hits: 0, pages: 0, reading: { done: 3, total: 40 } })).toMatchObject({ count: '', note: 'No matches yet. Reading pages: 3 of 40.' });
		expect(findStatus({ ...base, reading: { done: 3, total: 40 } }).note).toBe('12 matches on 4 pages so far. Reading pages: 3 of 40.');
		expect(findStatus({ ...base, query: '', reading: { done: 3, total: 40 } }).note).toBe('Reading pages: 3 of 40.');
	});

	it('says when the document has no text, and when pages were left out', () => {
		expect(findStatus({ ...base, noText: true }).note).toBe('No searchable text in this document.');
		expect(findStatus({ ...base, skipped: 250 }).note).toBe('250 pages at the end are not searched (a very long document).');
	});
});
