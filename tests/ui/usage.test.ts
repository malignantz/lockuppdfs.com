import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { makeAsset, makeSource, makeStore } from '../doc/helpers';
import type { ExportOptions, Source } from '../../src/lib/core/types';

type Usage = typeof import('../../src/lib/site/usage');

let beacons: string[];

beforeEach(() => {
	beacons = [];
	vi.stubGlobal('navigator', {
		sendBeacon: (url: string, body: string) => {
			expect(url).toBe('/use');
			beacons.push(JSON.parse(body).name);
			return true;
		}
	});
});

afterEach(() => {
	vi.unstubAllEnvs();
	vi.unstubAllGlobals();
	vi.resetModules();
});

async function load(site: 'lockup' | ''): Promise<Usage> {
	vi.stubEnv('VITE_SITE', site);
	return import('../../src/lib/site/usage');
}

describe('sending tool use', () => {
	it('sends each name once per open document, and again after another one opens', async () => {
		const u = await load('lockup');
		u.used('tool-text');
		u.used('tool-text');
		u.used('tool-redact');
		u.used('tool-text');
		expect(beacons).toEqual(['tool-text', 'tool-redact']);
		u.newDocument();
		u.used('tool-text');
		expect(beacons).toEqual(['tool-text', 'tool-redact', 'tool-text']);
	});

	it('sends every finished export, even of the same document', async () => {
		const u = await load('lockup');
		u.exported(['export-done', 'export-optimize']);
		u.exported(['export-done', 'export-optimize']);
		expect(beacons).toEqual(['export-done', 'export-optimize', 'export-done', 'export-optimize']);
	});

	it('falls back to a keepalive fetch, and never throws', async () => {
		const fetches: RequestInit[] = [];
		vi.stubGlobal('navigator', {});
		vi.stubGlobal('fetch', (url: string, init: RequestInit) => {
			expect(url).toBe('/use');
			fetches.push(init);
			return Promise.reject(new TypeError('offline'));
		});
		const u = await load('lockup');
		expect(() => u.used('find-used')).not.toThrow();
		expect(fetches).toHaveLength(1);
		expect(fetches[0]).toMatchObject({ method: 'POST', keepalive: true, body: '{"name":"find-used"}' });
		vi.stubGlobal('navigator', {
			sendBeacon: () => {
				throw new Error('blocked');
			}
		});
		expect(() => u.used('tool-dot')).not.toThrow();
	});

	it('does nothing at all on the plain site', async () => {
		const fetchSpy = vi.fn();
		vi.stubGlobal('fetch', fetchSpy);
		const u = await load('');
		u.used('tool-text');
		u.exported(['export-done']);
		const { store } = makeStore();
		u.watchUsage(store);
		store.addSource(makeSource('a', 2));
		expect(beacons).toEqual([]);
		expect(fetchSpy).not.toHaveBeenCalled();
	});
});

describe('what a document step counts', () => {
	async function watched() {
		const u = await load('lockup');
		const { store } = makeStore();
		u.watchUsage(store);
		return { u, store };
	}

	it('opening files, combining, page commands; undo and redo are not use', async () => {
		const { store } = await watched();
		const [a0, a1] = store.addSource(makeSource('a', 2));
		expect(beacons).toEqual(['open-pdf']);
		const pic: Source = { ...makeSource('b', 1, 'b.jpg'), kind: 'image' };
		store.addSource(pic);
		expect(beacons).toEqual(['open-pdf', 'open-picture', 'open-combine']);
		beacons.length = 0;
		store.rotatePages([a0], 90);
		store.rotatePages([a1], 90);
		store.movePages([a1], 0);
		store.duplicatePages([a0]);
		store.reversePages();
		store.sortBySource();
		store.cropPages([a0], { x: 0.1, y: 0.1, w: 0.5, h: 0.5 });
		store.removePages([a1]);
		expect(beacons).toEqual(['page-rotate', 'page-move', 'page-duplicate', 'page-reverse', 'page-sort', 'page-crop', 'page-delete']);
		beacons.length = 0;
		store.undo();
		store.redo();
		expect(beacons).toEqual([]);
	});

	it('protected files and blank pages', async () => {
		const { store } = await watched();
		store.addSource({ ...makeSource('a', 1), wasEncrypted: true, limits: { password: true, print: false, copy: false, edit: false, fill: false } });
		store.addSource({ ...makeSource('b', 1), wasEncrypted: true, limits: { password: false, print: true, copy: true, edit: false, fill: false } });
		store.addSource({ ...makeSource('c', 1, 'Blank page'), kind: 'blank' });
		expect(beacons).toEqual(['open-pdf', 'open-password', 'open-limited', 'open-combine', 'page-blank']);
	});

	it('each editor tool when it puts something on a page; a dropped step counts nothing', async () => {
		const { u, store } = await watched();
		const [p] = store.addSource(makeSource('a', 1));
		beacons.length = 0;
		const box = { x: 0.1, y: 0.1, w: 0.2, h: 0.1 };
		// Text: a gesture that is dropped (nothing typed) counts nothing; one that is kept counts.
		store.beginGesture('Add text');
		store.addStamp(p, { kind: 'text', text: 'Text', x: 0.1, y: 0.1, size: 0.02, color: 'black' });
		store.cancelGesture();
		expect(beacons).toEqual([]);
		store.beginGesture('Add text');
		const t = store.addStamp(p, { kind: 'text', text: 'Text', x: 0.1, y: 0.1, size: 0.02, color: 'black' });
		store.updateStamp(p, t, { text: 'Hello' });
		store.commitGesture();
		store.addStamp(p, { kind: 'text', text: '11/19/2026', x: 0.1, y: 0.3, size: 0.02, color: 'black' });
		store.addStamp(p, { kind: 'mark', mark: 'check', box: { x: 0.5, y: 0.5, w: 0.02, h: 0.02 } });
		store.addStamp(p, { kind: 'mark', mark: 'cross', box: { x: 0.5, y: 0.6, w: 0.02, h: 0.02 } });
		store.transaction('Add highlight', () => store.addStamp(p, { kind: 'highlight', color: 'yellow', box }));
		store.transaction('Add highlight', () => store.addStamp(p, { kind: 'highlight', color: 'yellow', box, rects: [box] }));
		store.transaction('Add redaction', () => store.addStamp(p, { kind: 'redact', box }));
		u.inkMade('sig', 'type');
		store.transaction('Place signature', () => {
			store.addAsset(makeAsset('sig', 'signature'));
			return store.addStamp(p, { kind: 'image', assetId: 'sig', box });
		});
		store.transaction('Place initials', () => {
			store.addAsset(makeAsset('ini', 'initials'));
			return store.addStamp(p, { kind: 'image', assetId: 'ini', box });
		});
		expect(beacons).toEqual([
			'tool-text',
			'tool-date',
			'tool-check',
			'tool-cross',
			'tool-highlight-box',
			'tool-highlight-text',
			'tool-redact',
			'tool-signature',
			'sign-typed',
			'tool-initials'
		]);
	});

	it('copies of marks, form answers, words marked for blackout', async () => {
		const { store } = await watched();
		const src = { ...makeSource('a', 2), hasForm: true };
		const [p, q] = store.addSource(src);
		beacons.length = 0;
		const box = { x: 0.1, y: 0.1, w: 0.2, h: 0.1 };
		store.transaction('Copy redaction to 1 page', () => store.addStamp(q, { kind: 'redact', box }));
		store.markForBlackout('secret', [{ pageId: p, box }]);
		store.setFormValue('a', 'name', '');
		store.setFormValue('a', 'name', 'Ada');
		expect(beacons).toEqual(['tool-copy-to-pages', 'find-blackout', 'form-fill']);
	});

	it('saved work opened, new work and Start over begin a new document', async () => {
		const { store } = await watched();
		const [p] = store.addSource(makeSource('a', 1));
		store.rotatePages([p], 90);
		const snap = { sources: store.state.sources, pages: store.state.pages, assets: store.state.assets, formValues: store.state.formValues };
		store.reset();
		store.restore(snap);
		store.setSelection([p]);
		store.rotatePages([p], 90);
		expect(beacons).toEqual(['open-pdf', 'page-rotate', 'saved-work-restored', 'page-rotate']);
		beacons.length = 0;
		store.clear();
		store.addSource(makeSource('b', 1));
		expect(beacons).toEqual(['open-pdf']);
	});
});

describe('what a finished export counts', () => {
	const base: ExportOptions = { filename: 'a.pdf', compress: true, stripMetadata: false, printCap: true };
	const ctx = { made: 'pdf' as const, pictureKind: 'jpg' as const, extract: false, redacting: false, oversized: 0, limits: false, readCap: 20 };

	it('one export-done and one name per option that was on', async () => {
		const u = await load('lockup');
		expect(u.exportEvents(base, ctx)).toEqual(['export-done', 'export-optimize']);
		expect(
			u.exportEvents(
				{
					...base,
					targetBytes: 1e6,
					password: 'pw',
					numbering: { style: 'page-n', position: 'bottom-center', size: 'medium', start: 1, skip: 0 } as unknown as ExportOptions['numbering'],
					watermark: { text: 'DRAFT', look: 'diagonal', strength: 'light', color: 'grey' },
					ocr: true,
					ocrPages: 300,
					bilevel: true,
					blankFields: true,
					flattenForms: true,
					stripMetadata: true
				},
				{ ...ctx, extract: true, oversized: 3, limits: true }
			)
		).toEqual([
			'export-done',
			'export-pages',
			'export-fit',
			'export-reduce-pictures',
			'export-password',
			'export-numbers',
			'export-watermark',
			'export-searchable',
			'export-read-all',
			'export-black-white',
			'export-keep-blanks',
			'export-lock-forms',
			'export-remove-details',
			'export-unlocked'
		]);
	});

	it('split and pictures; options forced on by blackout are not counted', async () => {
		const u = await load('lockup');
		expect(u.exportEvents(base, { ...ctx, made: 'split' })).toEqual(['export-done', 'export-split', 'export-optimize']);
		const pictures: ExportOptions = { filename: 'a.zip', compress: false, stripMetadata: false };
		expect(u.exportEvents(pictures, { ...ctx, made: 'pictures', pictureKind: 'png', limits: true })).toEqual(['export-done', 'export-png']);
		expect(u.exportEvents({ ...base, stripMetadata: true, flattenForms: true }, { ...ctx, redacting: true })).toEqual(['export-done', 'export-optimize']);
		expect(u.exportEvents({ ...base, ocr: true, ocrPages: 20 }, ctx)).toEqual(['export-done', 'export-optimize', 'export-searchable']);
	});
});
