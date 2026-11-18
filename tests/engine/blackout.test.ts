/**
 * The blackout check (ExportOptions.blackoutTerms, engine/blackout.ts) through exportPlan
 * with the real engines: the final file is read again and an export with a marked word
 * left anywhere (a wrapped line, a hyphenated line end, a form field, a comment, below the
 * crop, the document title) is refused with a plain sentence; a clean one passes and says
 * which pages are pictures it could not read. Corpus: tests/corpus/generate-blackout.mjs.
 */
import { describe, expect, it } from 'vitest';
import type { EngineErrorShape, ExportOptions, PageRef, Source, StampBox } from '../../src/lib/core/types';
import { blackoutForms, jsonString, leftMessage, pageList } from '../../src/lib/engine/blackout';
import { defaultOptions, engine, openCorpus, ref } from './helpers';

const T = 120_000;
const box = (x: number, y: number, w: number, h: number): StampBox => ({ x, y, w, h });
let sid = 0;
const redact = (b: StampBox) => ({ id: `r${sid++}`, kind: 'redact' as const, box: b });

/** Pages 612 x 792: a box over a line of 12 pt text drawn at baseline y (PDF points from the bottom), x 72 to x1. */
const lineBox = (y: number, x1 = 400) => box(70 / 612, (792 - y - 12) / 792, (x1 - 70) / 612, 18 / 792);

async function run(pages: PageRef[], sources: Source[], options: Partial<ExportOptions>) {
	return engine().exportPlan({ pages, options: { ...defaultOptions, ...options } }, sources, []);
}

async function refused(pages: PageRef[], sources: Source[], options: Partial<ExportOptions>): Promise<EngineErrorShape> {
	try {
		await run(pages, sources, options);
	} catch (e) {
		const err = e as EngineErrorShape;
		expect(err.code).toBe('verification-failed');
		const failed = err.checks?.filter((c) => !c.ok) ?? [];
		expect(failed.map((c) => c.name)).toEqual(['blackout']);
		return err;
	}
	throw new Error('the export was not refused');
}

describe('blackout check', () => {
	it(
		'passes when every occurrence is blacked out, and says so',
		async () => {
			const s = await openCorpus('blackout-names.pdf');
			// p1 lines at 650 and 614, p2 at 650, p3 at 650 and 632 (the wrap), p4 at 650.
			const pages = [
				ref(s, 0, 0, [redact(lineBox(650)), redact(lineBox(614))]),
				ref(s, 1, 0, [redact(lineBox(650))]),
				ref(s, 2, 0, [redact(lineBox(650, 560)), redact(lineBox(632))]),
				ref(s, 3, 0, [redact(lineBox(650))])
			];
			const res = await run(pages, [s], { blackoutTerms: ['Jane Doe'] });
			const c = res.checks.find((x) => x.name === 'blackout');
			expect(c?.ok).toBe(true);
			expect(c?.detail).toMatch(/^“Jane Doe” checked on 4 pages: not in the page text/);
			expect(c?.detail).not.toMatch(/Could not be checked/);
			expect(res.blackout).toEqual({ terms: ['Jane Doe'], unchecked: [] });
			// It is the last check.
			expect(res.checks[res.checks.length - 1].name).toBe('blackout');
		},
		T
	);

	it(
		'refuses a phrase wrapped across two lines that Find could not see',
		async () => {
			const s = await openCorpus('blackout-names.pdf');
			const pages = [
				ref(s, 0, 0, [redact(lineBox(650)), redact(lineBox(614))]),
				ref(s, 1, 0, [redact(lineBox(650))]),
				ref(s, 2),
				ref(s, 3, 0, [redact(lineBox(650))])
			];
			const err = await refused(pages, [s], { blackoutTerms: ['jane doe'] });
			expect(err.message).toBe(
				'“jane doe” still appears on page 3 (it may wrap across lines or sit in a scanned picture). Nothing was saved. Black it out on page 3 and export again.'
			);
		},
		T
	);

	it(
		'refuses a word left in a form field, and in a comment',
		async () => {
			const s = await openCorpus('blackout-hidden.pdf');
			let err = await refused([ref(s, 0)], [s], { blackoutTerms: ['Jane Doe'] });
			expect(err.message).toBe('“Jane Doe” still appears in a form field on page 1. Nothing was saved. Black out the field on page 1 and export again.');
			err = await refused([ref(s, 1)], [s], { blackoutTerms: ['Jane Doe'] });
			expect(err.message).toBe('“Jane Doe” still appears in a comment on page 1. Nothing was saved. Black out the comment on page 1 and export again.');
		},
		T
	);

	it(
		'a flattened field is page text, and is still found',
		async () => {
			const s = await openCorpus('blackout-hidden.pdf');
			// Redaction elsewhere on the page flattens the form: the value becomes page content.
			const err = await refused([ref(s, 0, 0, [redact(box(0.8, 0.9, 0.1, 0.05))])], [s], { blackoutTerms: ['Jane Doe'] });
			expect(err.message).toMatch(/^“Jane Doe” still appears on page 1 /);
		},
		T
	);

	it(
		'refuses a word hidden by the crop, and a hyphenated line end',
		async () => {
			const s = await openCorpus('blackout-hidden.pdf');
			let err = await refused([ref(s, 3)], [s], { blackoutTerms: ['Jane Doe'] });
			expect(err.message).toMatch(/^“Jane Doe” still appears on page 1 /);
			err = await refused([ref(s, 2), ref(s, 4)], [s], { blackoutTerms: ['Jane Doe'] });
			expect(err.message).toMatch(/^“Jane Doe” still appears on page 2 /);
		},
		T
	);

	it(
		'refuses a word in the document title (hidden text not on a page)',
		async () => {
			const s = await openCorpus('metadata.pdf');
			const res = await run([ref(s, 0)], [s], {});
			expect(res.checks.every((c) => c.ok)).toBe(true);
			// metadata.pdf's title: a word from it.
			const { PDFDocument } = await import('@cantoo/pdf-lib');
			const title = (await PDFDocument.load(res.bytes, { updateMetadata: false })).getTitle();
			expect(title).toBeTruthy();
			const word = title!.split(/\s+/).find((w) => w.length > 3)!;
			const err = await refused([ref(s, 0)], [s], { blackoutTerms: [word] });
			expect(err.message).toBe(`“${word}” still appears in the file’s hidden text (such as a bookmark, title or attachment name). Nothing was saved. Turn on Remove hidden details, or black out a page area, and export again.`);
			// Removing hidden details removes it.
			const ok = await run([ref(s, 0)], [s], { blackoutTerms: [word], stripMetadata: true });
			expect(ok.checks.find((c) => c.name === 'blackout')?.ok).toBe(true);
		},
		T
	);

	it(
		'passes a clean file, saying which pages are pictures it could not read; with a password',
		async () => {
			const s = await openCorpus('blackout-hidden.pdf');
			const res = await run([ref(s, 2), ref(s, 2)], [s], { blackoutTerms: ['Jane Doe', 'Acme'], password: 'pw' });
			const c = res.checks.find((x) => x.name === 'blackout')!;
			expect(c.ok).toBe(true);
			expect(c.detail).toMatch(/Could not be checked: pages 1 and 2 are pictures with no text\./);
			expect(res.blackout).toEqual({ terms: ['Jane Doe', 'Acme'], unchecked: [1, 2] });
		},
		T
	);

	it(
		'a duplicated page needs its own box: one copy left is refused',
		async () => {
			const s = await openCorpus('blackout-names.pdf');
			const err = await refused([ref(s, 1, 0, [redact(lineBox(650))]), ref(s, 1, 90)], [s], { blackoutTerms: ['Jane Doe'] });
			expect(err.message).toMatch(/^“Jane Doe” still appears on page 2 /);
		},
		T
	);
});

describe('blackout helpers', () => {
	it('validates and de-duplicates terms', () => {
		expect(blackoutForms(undefined)).toEqual([]);
		expect(blackoutForms(['Jane Doe', 'jane  DOE', 'Acme']).map((t) => t.term)).toEqual(['Jane Doe', 'Acme']);
		expect(() => blackoutForms(['  '])).toThrow(/empty/);
		expect(() => blackoutForms(['x'.repeat(201)])).toThrow(/too long/);
		expect(() => blackoutForms(new Array(51).fill('a'))).toThrow(/At most 50/);
	});

	it('reads qpdf JSON strings', () => {
		expect(jsonString('u:Jane Doe')).toBe('Jane Doe');
		expect(jsonString('b:feff004a0061006e0065')).toBe('Jane');
		expect(jsonString('b:4a616e65')).toBe('Jane');
		expect(jsonString('/Name')).toBeNull();
		expect(jsonString('3 0 R')).toBeNull();
	});

	it('words', () => {
		expect(pageList([3])).toBe('page 3');
		expect(pageList([3, 5, 9])).toBe('pages 3, 5 and 9');
		expect(pageList([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])).toBe('pages 1, 2, 3, 4, 5, 6, 7, 8 and 2 more');
		expect(leftMessage({ term: 'X', page: null, where: 'file' })).toMatch(/hidden text/);
	});
});
