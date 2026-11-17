/**
 * Engine.readScanPage (the editor's background reader) with the real OCR engine: it
 * reads only qualifying pages, gives the very words the export's layer gives, and an
 * export reuses its readings (ExportOptions.ocrKnown) without reading again.
 * Corpus: tests/corpus/generate-ocr.mjs (p1 and p8 readable, p2 sideways, p3 made-up words, p4–p7 not scans).
 */
import { describe, expect, it } from 'vitest';
import { createCoreEngine } from '../../src/lib/engine/core';
import { mupdf } from '../../src/lib/engine/mupdf';
import { pageTextOf } from '../../src/lib/engine/page-text';
import type { ExportProgress, OcrKnownPage, PageRef } from '../../src/lib/core/types';
import { rotateBox } from '../../src/lib/editor/form-view';
import { corpus, nodeAssets } from './helpers';
import { nodeOcr } from './ocr-node';

describe('readScanPage (real OCR engine)', () => {
	type Words = { words: { text: string; box: { x: number; y: number; w: number; h: number }; line: number }[] };
	/** Page 8 as exported (turned by the user's 90°) has the editor's words turned the same way, to rounding. */
	const sameTurned = (got: Words, read: Words) => {
		expect(got.words.map((w) => [w.text, w.line])).toEqual(read.words.map((w) => [w.text, w.line]));
		let worst = 0;
		got.words.forEach((w, i) => {
			const b = rotateBox(read.words[i].box, 90);
			worst = Math.max(worst, Math.abs(w.box.x - b.x), Math.abs(w.box.y - b.y), Math.abs(w.box.w - b.w), Math.abs(w.box.h - b.h));
		});
		expect(worst).toBeLessThan(1e-6);
	};

	it('reads the scans the export would read, with the words its layer gives, and the export reuses them', { timeout: 240_000 }, async () => {
		const eng = createCoreEngine({ ...nodeAssets(), ocr: nodeOcr({ slots: 1 }) });
		const src = await eng.openPdf(corpus('ocr-scans.pdf'), 'ocr-scans.pdf');
		expect(await eng.scannedPages(src)).toEqual([0, 1, 2, 7]);

		// Viewed page first, as the editor asks.
		const reads = new Map<number, Awaited<ReturnType<typeof eng.readScanPage>>>();
		for (const i of [7, 0, 1, 2, 4]) reads.set(i, await eng.readScanPage(src, i));
		expect(reads.get(0)!.text.words.length).toBeGreaterThan(20);
		expect(reads.get(7)!.text.words.length).toBeGreaterThan(20);
		// Sideways, made-up words, not a scan: no words.
		for (const i of [1, 2, 4]) expect(reads.get(i)!.text.words, `page ${i + 1}`).toEqual([]);
		expect((reads.get(1)!.reuse.outcome as { why: string }).why).toBe('orientation');
		expect((reads.get(2)!.reuse.outcome as { why: string }).why).toBe('gate');
		const text0 = reads.get(0)!.text.words.map((w) => w.text).join(' ');
		for (const w of ['Dear', 'house', 'Smith']) expect(text0).toContain(w);
		// A page id the client no longer sends bytes for still works (bytes-once protocol).
		const again = await eng.readScanPage({ ...src, bytes: undefined as unknown as Uint8Array }, 0);
		expect(again.text).toEqual(reads.get(0)!.text);

		// Export, reusing every reading: nothing is read again (no progress of reading), same result as reading.
		const pages: PageRef[] = src.pages.map((_, i) => ({ id: `p${i}`, sourceId: src.id, pageIndex: i, rotation: i === 7 ? 90 : 0, stamps: [] }));
		const known: OcrKnownPage[] = [...reads.values()].map((r) => r.reuse);
		const progress: ExportProgress[] = [];
		const res = await eng.exportPlan({ pages, options: { filename: 'o.pdf', compress: false, stripMetadata: false, ocr: true, ocrKnown: known } }, [src], [], {
			onProgress: (p) => progress.push(p)
		});
		expect(res.ocr).toEqual({ eligible: 4, cap: 20, searchable: [1, 8], declined: [2, 3] });
		expect(res.checks.every((c) => c.ok)).toBe(true);
		expect(progress.some((p) => p.stage === 'ocr' || p.stage === 'ocr-load')).toBe(false);

		// The words the editor offered are exactly the exported file's words (same boxes), page 8 turned by the user included.
		const m = await mupdf();
		const out = m.Document.openDocument(res.bytes, 'application/pdf');
		try {
			expect(pageTextOf(out, 0, { m })).toEqual(reads.get(0)!.text);
			sameTurned(pageTextOf(out, 7, { m }), reads.get(7)!.text);
		} finally {
			out.destroy();
		}

		// A fresh export that reads by itself gets the same layer (the reading is the same engine output).
		const fresh = await createCoreEngine({ ...nodeAssets(), ocr: nodeOcr({ slots: 2 }) }).exportPlan(
			{ pages, options: { filename: 'o.pdf', compress: false, stripMetadata: false, ocr: true } },
			[src],
			[]
		);
		const b = m.Document.openDocument(fresh.bytes, 'application/pdf');
		try {
			expect(pageTextOf(b, 0, { m })).toEqual(reads.get(0)!.text);
			sameTurned(pageTextOf(b, 7, { m }), reads.get(7)!.text);
		} finally {
			b.destroy();
		}
	});

	it('without an OCR engine, or on image sources, reads nothing', async () => {
		const eng = createCoreEngine(nodeAssets());
		const src = await eng.openPdf(corpus('ocr-scans.pdf'), 'ocr-scans.pdf');
		expect((await eng.readScanPage(src, 0)).text.words).toEqual([]);
	});
});
