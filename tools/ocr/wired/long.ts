/**
 * A long "Make scanned pages searchable" run through the app's own code path
 * (createCoreEngine → exportPlan with ExportOptions.ocr and ocrPages, Node OCR workers
 * tests/engine/ocr-node.ts), to choose the engine's ceiling (ocr/stage.ts OCR_MAX):
 * time per page and the process's memory (RSS, worker threads included) across the run,
 * to see that reader replacement keeps memory flat and that nothing piles up with the
 * page count (rendered PNGs, OCR results, layer pages).
 *
 *   node --experimental-transform-types --no-warnings --import ./tools/survey/register.mjs \
 *     tools/ocr/wired/long.ts [--pages 100] [--slots 2]
 *
 * The file: <out>/bench/bench20.pdf (tools/ocr/wired/chrome.ts make: 20 held-out Letter
 * scans at 300 dpi) repeated into one PDF of `pages` distinct pages (each read on its
 * own). Output: /home/garrett/pdf-survey/out-ocr-all/long-<pages>.json (never the repo).
 */
import fs from 'node:fs';
import path from 'node:path';
import * as PL from '@cantoo/pdf-lib';
import { parseArgs } from '../../survey/lib/common';
import type { ExportProgress, PageRef } from '../../../src/lib/core/types';
import type { OcrTrace } from '../../../src/lib/engine/ocr/stage';
import { OUT as BUILD_OUT, quant, wiredEngine } from './common';

const args = parseArgs(process.argv.slice(2));
const N = args.num('pages', 100);
const slots = args.num('slots', 2);
const OUT = '/home/garrett/pdf-survey/out-ocr-all';
fs.mkdirSync(OUT, { recursive: true });

const src = new Uint8Array(fs.readFileSync(path.join(BUILD_OUT, 'bench', 'bench20.pdf')));
const file = path.join(OUT, `long-${N}.pdf`);
if (!fs.existsSync(file)) {
	const from = await PL.PDFDocument.load(src);
	const out = await PL.PDFDocument.create();
	const idx = from.getPageIndices();
	for (let i = 0; i < N; ) {
		const take = idx.slice(0, Math.min(idx.length, N - i));
		for (const p of await out.copyPages(from, take)) out.addPage(p);
		i += take.length;
	}
	fs.writeFileSync(file, await out.save({ useObjectStreams: false }));
}
const bytes = new Uint8Array(fs.readFileSync(file));

const mb = (b: number) => Math.round(b / 1024 / 1024);
const t0 = performance.now();
const at = () => Math.round(performance.now() - t0);
const samples: { t: number; rss: number; heap: number; ext: number; read: number }[] = [];
let readCount = 0;
const sample = () => {
	const m = process.memoryUsage();
	samples.push({ t: at(), rss: mb(m.rss), heap: mb(m.heapUsed), ext: mb(m.external + m.arrayBuffers), read: readCount });
};
const timer = setInterval(sample, 1000);
const traces: (OcrTrace['ms'] & { page: number; t: number; rss: number; ok: boolean; attempts: number })[] = [];
const stages: { t: number; stage: string }[] = [];

const eng = wiredEngine((tr) => {
	readCount++;
	traces.push({ page: tr.pageIndex + 1, t: at(), rss: mb(process.memoryUsage().rss), ok: tr.outcome.ok, attempts: tr.attempts, ...tr.ms });
	if (readCount % 10 === 0) console.log(`${readCount}/${N} pages, ${(at() / 1000).toFixed(0)} s, rss ${mb(process.memoryUsage().rss)} MB`);
}, slots);
sample();
const source = await eng.openPdf(bytes, path.basename(file));
const pages: PageRef[] = source.pages.map((_, i) => ({ id: `p${i}`, sourceId: source.id, pageIndex: i, rotation: 0, stamps: [] }));
let last = '';
const res = await eng.exportPlan({ pages, options: { filename: 'long.pdf', compress: false, stripMetadata: false, ocr: true, ocrPages: N } }, [source], [], {
	onProgress: (p: ExportProgress) => {
		if (p.stage !== last) stages.push({ t: at(), stage: (last = p.stage) });
	}
});
const end = at();
sample();
clearInterval(timer);

const readMs = traces.map((t) => t.read);
const allMs = traces.map((t) => t.render + t.orient + t.read);
const readingEnd = traces.at(-1)!.t;
const rssAt = (n: number) => traces[Math.min(traces.length, n) - 1]?.rss;
// RSS once the first readers are warm (page 10) vs at the end of reading, and a least-squares slope over the reading.
const warm = traces.slice(10);
const fit = (() => {
	const xs = warm.map((t, i) => i + 11);
	const ys = warm.map((t) => t.rss);
	const mx = xs.reduce((a, b) => a + b, 0) / xs.length;
	const my = ys.reduce((a, b) => a + b, 0) / ys.length;
	const num = xs.reduce((s, x, i) => s + (x - mx) * (ys[i] - my), 0);
	const den = xs.reduce((s, x) => s + (x - mx) ** 2, 0);
	return den ? num / den : 0;
})();
const summary = {
	pages: N,
	slots,
	cores: (await import('node:os')).cpus().length,
	ocr: res.ocr,
	checks: res.checks.map((c) => `${c.name}:${c.ok ? 'ok' : 'FAIL'}`),
	totalS: +(end / 1000).toFixed(1),
	readingS: +(readingEnd / 1000).toFixed(1),
	afterReadingS: +((end - readingEnd) / 1000).toFixed(1),
	wallPerPageS: +(readingEnd / 1000 / N).toFixed(2),
	readMs: { median: Math.round(quant(readMs, 0.5)), p90: Math.round(quant(readMs, 0.9)), max: Math.max(...readMs.map(Math.round)) },
	pageMs: { median: Math.round(quant(allMs, 0.5)), p90: Math.round(quant(allMs, 0.9)), max: Math.max(...allMs.map(Math.round)) },
	retries: traces.filter((t) => t.attempts > 1).length,
	rss: { start: samples[0].rss, page10: rssAt(10), byPage: Object.fromEntries(traces.filter((_, i) => (i + 1) % 50 === 0).map((t, i) => [(i + 1) * 50, t.rss])), endReading: traces.at(-1)!.rss, peak: Math.max(...samples.map((s) => s.rss)), end: samples.at(-1)!.rss },
	rssSlopeMBPerPage: +fit.toFixed(2),
	peakHeapMB: Math.max(...samples.map((s) => s.heap)),
	peakExternalMB: Math.max(...samples.map((s) => s.ext)),
	outMB: +(res.bytes.length / 1024 / 1024).toFixed(1),
	stages
};
fs.writeFileSync(path.join(OUT, `long-${N}.json`), JSON.stringify({ summary, traces, samples }, null, 1));
console.log(JSON.stringify(summary, null, 1));
process.exit(0);
