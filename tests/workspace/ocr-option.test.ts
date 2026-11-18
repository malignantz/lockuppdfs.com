import { describe, expect, it } from 'vitest';
import { OCR_CAP, OCR_MAX, readerSlots } from '../../src/lib/engine/ocr/stage';
import {
	OCR_PAGE_CAP,
	OCR_PAGE_MAX,
	aboutTime,
	countScanned,
	ocrCapNotice,
	ocrKeepOpen,
	ocrProgressText,
	ocrSeconds,
	ocrSlots,
	ocrSummary,
	offerReadAll,
	readAllHint,
	readAllLabel
} from '../../src/lib/workspace/ocr-option';
import { DEFAULT_FORM, buildExportOptions } from '../../src/lib/workspace/logic';
import type { PageRef, Source } from '../../src/lib/core/types';

describe('Make scanned pages searchable: dialog words', () => {
	it('uses the engine cap, ceiling and reader count', () => {
		expect(OCR_PAGE_CAP).toBe(OCR_CAP);
		expect(OCR_PAGE_MAX).toBe(OCR_MAX);
		for (let cores = 1; cores <= 32; cores++) expect(ocrSlots(cores)).toBe(readerSlots(cores));
	});

	it('says before export when more pages are scanned than one export reads', () => {
		expect(ocrCapNotice(20)).toBeNull();
		expect(ocrCapNotice(34)).toBe('This file has 34 scanned pages. The first 20 will be made searchable.');
		// "Read all" on: nothing to say up to the ceiling, then the same words with it.
		expect(ocrCapNotice(34, true)).toBeNull();
		expect(ocrCapNotice(500, true)).toBeNull();
		expect(ocrCapNotice(612, true)).toBe('This file has 612 scanned pages. The first 500 will be made searchable.');
	});

	it('offers "Read all" past the first 20, with an honest time', () => {
		expect(offerReadAll(20)).toBe(false);
		expect(offerReadAll(21)).toBe(true);
		expect(readAllLabel(34)).toBe('Read all 34 pages');
		expect(readAllLabel(612)).toBe('Read the first 500 pages');
		// Two readers on 4+ cores: 4.1 s a page (measured); one reader: 7.6 s.
		expect(ocrSeconds(34, 8)).toBeCloseTo(34 * 4.1);
		expect(ocrSeconds(34, 2)).toBeCloseTo(34 * 7.6);
		expect(readAllHint(34, 8)).toBe('Takes about 2 minutes. Keep this tab open while it reads.');
		expect(readAllHint(34, 2)).toBe('Takes about 4 minutes. Keep this tab open while it reads.');
		expect(readAllHint(150, 4)).toBe('Takes about 10 minutes. Keep this tab open while it reads.');
		// Past the ceiling the time is the ceiling's.
		expect(readAllHint(5000, 4)).toBe(readAllHint(500, 4));
		expect(readAllHint(500, 4)).toBe('Takes about 35 minutes. Keep this tab open while it reads.');
		expect(readAllHint(500, 1)).toBe('Takes about an hour. Keep this tab open while it reads.');
	});

	it('words a time coarsely', () => {
		expect(aboutTime(20)).toBe('less than a minute');
		expect(aboutTime(60)).toBe('about a minute');
		expect(aboutTime(150)).toBe('about 3 minutes');
		expect(aboutTime(9 * 60)).toBe('about 9 minutes');
		expect(aboutTime(22 * 60)).toBe('about 20 minutes');
		expect(aboutTime(63 * 60)).toBe('about an hour');
		expect(aboutTime(100 * 60)).toBe('about 1.75 hours');
	});

	it('asks to keep the tab open only while a long reading runs', () => {
		expect(ocrKeepOpen(null)).toBe(false);
		expect(ocrKeepOpen({ stage: 'ocr', done: 3, total: 20 })).toBe(false);
		expect(ocrKeepOpen({ stage: 'ocr', done: 3, total: 34 })).toBe(true);
		expect(ocrKeepOpen({ stage: 'ocr', done: 34, total: 34 })).toBe(false);
		expect(ocrKeepOpen({ stage: 'check', done: 0, total: 3 })).toBe(false);
	});

	it('shows reading progress', () => {
		expect(ocrProgressText(null)).toBeNull();
		expect(ocrProgressText({ stage: 'ocr-load' })).toBe('Getting the text reader ready…');
		expect(ocrProgressText({ stage: 'ocr', done: 2, total: 12 })).toBe('Reading page 3 of 12');
		expect(ocrProgressText({ stage: 'ocr', done: 11, total: 12 })).toBe('Reading page 12 of 12');
		expect(ocrProgressText({ stage: 'ocr', done: 12, total: 12 })).toBeNull();
	});

	it('says what happened after export, without alarm for declined pages', () => {
		const r = (searchable: number, declined: number, eligible = searchable + declined) => ({
			eligible,
			cap: 20,
			searchable: Array.from({ length: searchable }, (_, i) => i + 1),
			declined: Array.from({ length: declined }, (_, i) => i + 50)
		});
		expect(ocrSummary(undefined)).toEqual([]);
		expect(ocrSummary(r(0, 0))).toEqual([]);
		expect(ocrSummary(r(12, 2))).toEqual(['12 pages made searchable. 2 pages were left as they were because the text could not be read well enough.']);
		expect(ocrSummary(r(1, 1))).toEqual(['1 page made searchable. 1 page was left as it was because the text could not be read well enough.']);
		expect(ocrSummary(r(3, 0))).toEqual(['3 pages made searchable.']);
		expect(ocrSummary(r(0, 2))).toEqual(['No pages were made searchable: the text could not be read well enough. The pages are unchanged.']);
		expect(ocrSummary(r(18, 2, 34))).toEqual([
			'18 pages made searchable. 2 pages were left as they were because the text could not be read well enough.',
			'This file has 34 scanned pages. Only the first 20 were read.'
		]);
	});

	it('counts scanned pages of the plan, without redaction pages, asking each source once', async () => {
		let asks = 0;
		const engine = {
			scannedPages: async (s: Source) => {
				asks++;
				return s.id === 'a' ? [0, 2] : [];
			}
		};
		const src = (id: string, kind: Source['kind'] = 'pdf') => ({ id, kind }) as Source;
		const page = (sourceId: string, pageIndex: number, redact = false) =>
			({ id: `${sourceId}${pageIndex}`, sourceId, pageIndex, rotation: 0, stamps: redact ? [{ id: 'r', kind: 'redact', box: { x: 0, y: 0, w: 0.1, h: 0.1 } }] : [] }) as PageRef;
		const pages = [page('a', 0), page('a', 1), page('a', 2, true), page('a', 2), page('b', 0), page('c', 0)];
		expect(await countScanned(engine, pages, [src('a'), src('b'), src('c', 'image')])).toBe(2);
		expect(await countScanned(engine, pages, [src('a'), src('b'), src('c', 'image')])).toBe(2);
		expect(asks).toBe(2);
	});

	it('asks the engine only when the option is on and a page qualifies', () => {
		const f = { ...DEFAULT_FORM, filename: 'x.pdf', ocr: true };
		expect(DEFAULT_FORM.ocr).toBe(false);
		const ctx = { pageCount: 3, redactions: 0, hasForm: false };
		const on = buildExportOptions(f, { ...ctx, scanned: 2 });
		const none = buildExportOptions(f, { ...ctx, scanned: 0 });
		const off = buildExportOptions({ ...f, ocr: false }, { ...ctx, scanned: 2 });
		expect(on.ok && on.options.ocr).toBe(true);
		expect(none.ok && none.options.ocr).toBeFalsy();
		expect(off.ok && off.options.ocr).toBeFalsy();
		// The first 20 unless "Read all" is on (remembered off by default).
		expect(DEFAULT_FORM.ocrAll).toBe(false);
		expect(on.ok && on.options.ocrPages).toBeUndefined();
		const all = buildExportOptions({ ...f, ocrAll: true }, { ...ctx, scanned: 34 });
		expect(all.ok && all.options.ocrPages).toBe(OCR_PAGE_MAX);
		const allOff = buildExportOptions({ ...f, ocr: false, ocrAll: true }, { ...ctx, scanned: 34 });
		expect(allOff.ok && allOff.options.ocrPages).toBeUndefined();
	});
});
