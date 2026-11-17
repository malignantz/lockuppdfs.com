import { describe, expect, it } from 'vitest';
import { ScanQueue, waitEstimate, type QueueConfig } from '../../src/lib/editor/scan-queue';

const cfg: QueueConfig = { autoAll: 4, autoFirst: 2, ahead: 2, maxDocPages: 50, keep: 5 };
const keys = (n: number, src = 's') => Array.from({ length: n }, (_, i) => `${src}:${i}`);
const res = (words = true) => ({ words, value: 'v', ms: 5000 });

/** Reads every page the queue offers, returning them in order. */
function drain(q: ScanQueue<string>): string[] {
	const out: string[] = [];
	for (let k = q.next(); k; k = q.next()) {
		q.start(k);
		q.finish(k, res());
		out.push(k);
	}
	return out;
}

describe('ScanQueue', () => {
	it('a short scan is read whole: the viewed page first, then the pages after it, then the rest in order', () => {
		const q = new ScanQueue<string>(cfg);
		q.setDocument({ all: keys(6), eligible: ['s:0', 's:2', 's:3', 's:5'], unlisted: new Set() });
		q.view('s:3');
		// The viewed page, the qualifying pages right after it, then the rest in order.
		expect(q.order()).toEqual(['s:3', 's:5', 's:0', 's:2']);
		expect(drain(q)).toEqual(['s:3', 's:5', 's:0', 's:2']);
		expect(q.state('s:1')).toBe('none');
		expect(q.state('s:2')).toBe('done');
	});

	it('a long scan: the first pages at once, then the viewed page and the next ones as the person moves', () => {
		const q = new ScanQueue<string>(cfg);
		q.setDocument({ all: keys(20), eligible: keys(20), unlisted: new Set() });
		expect(drain(q)).toEqual(['s:0', 's:1']);
		expect(q.state('s:9')).toBe('none');
		q.view('s:9');
		expect(q.order()).toEqual(['s:9', 's:10', 's:11']);
		q.view('s:10');
		// Pages asked for stay wanted; the newly viewed page goes first.
		expect(q.order()).toEqual(['s:10', 's:11', 's:12', 's:9']);
		expect(drain(q)).toEqual(['s:10', 's:11', 's:12', 's:9']);
	});

	it('the page in flight is not offered again, and the viewed page jumps the queue', () => {
		const q = new ScanQueue<string>(cfg);
		q.setDocument({ all: keys(4), eligible: keys(4), unlisted: new Set() });
		q.start(q.next()!);
		expect(q.reading).toBe('s:0');
		expect(q.next()).toBeNull();
		q.view('s:3');
		expect(q.order()).toEqual(['s:3', 's:1', 's:2']);
		expect(q.pagesUntil('s:3')).toBe(2);
		expect(q.pagesUntil('s:0')).toBe(1);
		expect(q.state('s:0')).toBe('reading');
		expect(q.state('s:3')).toBe('waiting');
	});

	it('removed pages are dropped (queued and read); a removed page in flight leaves no result', () => {
		const q = new ScanQueue<string>(cfg);
		q.setDocument({ all: keys(4), eligible: keys(4), unlisted: new Set() });
		q.start('s:0');
		q.finish('s:0', res());
		q.start('s:1');
		q.setDocument({ all: ['s:2', 's:3'], eligible: ['s:2', 's:3'], unlisted: new Set() });
		expect(q.result('s:0')).toBeUndefined();
		q.finish('s:1', res());
		expect(q.result('s:1')).toBeUndefined();
		expect(drain(q)).toEqual(['s:2', 's:3']);
	});

	it('cancel (the file went away) frees the slot without a result', () => {
		const q = new ScanQueue<string>(cfg);
		q.setDocument({ all: keys(2), eligible: keys(2), unlisted: new Set() });
		q.start('s:0');
		q.cancel();
		expect(q.reading).toBeNull();
		expect(q.next()).toBe('s:0');
	});

	it('a very long file is read only where the person looks', () => {
		const q = new ScanQueue<string>(cfg);
		q.setDocument({ all: [...keys(3, 'a'), ...keys(500, 'big')], eligible: ['a:0'], unlisted: new Set(['big']) });
		expect(q.order()).toEqual(['a:0']);
		q.view('big:200');
		expect(q.order()).toEqual(['big:200', 'a:0']);
		expect(drain(q)).toEqual(['big:200', 'a:0']);
		q.view('big:201');
		expect(q.order()).toEqual(['big:201']);
	});

	it('keeps at most `keep` results, never the viewed one; a dropped page is read again only when wanted again', () => {
		const q = new ScanQueue<string>({ ...cfg, keep: 2, autoAll: 10 });
		q.setDocument({ all: keys(4), eligible: keys(4), unlisted: new Set() });
		q.view('s:0');
		expect(drain(q)).toEqual(['s:0', 's:1', 's:2', 's:3']);
		expect(q.result('s:0')).toBeDefined();
		expect(q.values().length).toBe(2);
		expect(q.state('s:1')).toBe('none');
		expect(q.next()).toBeNull();
		q.view('s:1');
		expect(q.next()).toBe('s:1');
	});

	it('a failed reading is a result without words: not tried again', () => {
		const q = new ScanQueue<string>(cfg);
		q.setDocument({ all: keys(1), eligible: keys(1), unlisted: new Set() });
		q.start('s:0');
		q.finish('s:0', res(false));
		expect(q.next()).toBeNull();
		expect(q.result('s:0')?.words).toBe(false);
	});

	it('progress counts the pages of the current reading, new pages joining it', () => {
		const q = new ScanQueue<string>(cfg);
		q.setDocument({ all: keys(20), eligible: keys(20), unlisted: new Set() });
		expect(q.progress()).toEqual({ done: 0, total: 2 });
		q.start('s:0');
		q.finish('s:0', res());
		expect(q.progress()).toEqual({ done: 1, total: 2 });
		q.view('s:9');
		expect(q.progress()).toEqual({ done: 1, total: 5 });
		drain(q);
		expect(q.busy).toBe(false);
		q.view('s:15');
		expect(q.progress()).toEqual({ done: 0, total: 3 });
	});
});

describe('waitEstimate', () => {
	it('says nothing before a page was timed', () => {
		expect(waitEstimate([], 2, 1000, true)).toBeNull();
	});
	it('the page in flight counts what is left of it, then whole pages', () => {
		expect(waitEstimate([6000], 1, 2000, true)).toBe(4000);
		expect(waitEstimate([6000], 2, 2000, true)).toBe(10000);
		expect(waitEstimate([6000], 2, 0, false)).toBe(12000);
		// Overrun: never negative.
		expect(waitEstimate([6000], 1, 9000, true)).toBe(0);
	});
	it('uses the median of the last pages, so one slow first page does not swing it', () => {
		expect(waitEstimate([20000, 5000, 6000], 1, 0, false)).toBe(6000);
	});
	it('a page already read waits for nothing', () => {
		expect(waitEstimate([6000], 0, 0, false)).toBe(0);
	});
});
