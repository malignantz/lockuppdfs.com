/**
 * "Make scanned pages searchable" in the export dialog: when it is offered and what it
 * says. The engine decides which pages qualify (Engine.scannedPages) and reports what
 * happened (ExportResult.ocr); this file only words it.
 */
import type { Engine, ExportProgress, OcrReport, PageRef, Source, SourceId } from '../core/types';
import { plural } from './logic';

/** Most pages one export reads unless "Read all" is on (the engine's OCR_CAP; checked by a test). */
export const OCR_PAGE_CAP = 20;
/** Most pages one export reads with "Read all" on (the engine's OCR_MAX; checked by a test). */
export const OCR_PAGE_MAX = 300;

export const OCR_LABEL = 'Make scanned pages searchable';
export const OCR_HINT = 'Reads typed English on scanned pages so you can search and copy the text. The pages look the same.';

/**
 * Desktop only: a mouse or trackpad as the main pointer, with hover. Phones and tablets
 * used by touch report a coarse pointer and no hover, so they never see the option
 * (OCR there would take minutes; measured as a CPU-limited proxy only).
 */
export function isDesktop(): boolean {
	if (typeof matchMedia !== 'function') return false;
	return matchMedia('(pointer: fine) and (hover: hover)').matches && !matchMedia('(pointer: coarse)').matches;
}

/** Scanned pages per source, asked once per source (sources never change once opened). */
const asked = new Map<SourceId, Promise<number[]>>();

export function scannedPagesOf(engine: Pick<Engine, 'scannedPages'>, source: Source): Promise<number[]> {
	let p = asked.get(source.id);
	if (!p) {
		p = source.kind === 'pdf' ? engine.scannedPages(source).catch(() => []) : Promise.resolve([]);
		asked.set(source.id, p);
	}
	return p;
}

/** How many of `pages` the option would try (before the cap). */
export async function countScanned(engine: Pick<Engine, 'scannedPages'>, pages: readonly PageRef[], sources: readonly Source[]): Promise<number> {
	return (await scannedRefs(engine, pages, sources)).length;
}

/** The pages of `pages` the option would try, in document order (before the cap). */
export async function scannedRefs(engine: Pick<Engine, 'scannedPages'>, pages: readonly PageRef[], sources: readonly Source[]): Promise<PageRef[]> {
	const byId = new Map(sources.map((s) => [s.id, s]));
	const sets = new Map<SourceId, Set<number>>();
	for (const id of new Set(pages.map((p) => p.sourceId))) {
		const s = byId.get(id);
		if (s?.kind === 'pdf') sets.set(id, new Set(await scannedPagesOf(engine, s)));
	}
	return pages.filter((p) => !p.stamps.some((s) => s.kind === 'redact') && sets.get(p.sourceId)?.has(p.pageIndex));
}

/** Source pages an export of `refs` (scannedRefs) still has to read with `cap`: each source page once, without the kept ones. */
export function pagesToRead(refs: readonly Pick<PageRef, 'sourceId' | 'pageIndex'>[], cap: number, kept: ReadonlySet<string>): number {
	const left = new Set<string>();
	for (const r of refs.slice(0, cap)) {
		const k = `${r.sourceId}:${r.pageIndex}`;
		if (!kept.has(k)) left.add(k);
	}
	return left.size;
}

/** The pages an export reads (ExportOptions.ocrPages): the first 20, or with "Read all" up to the ceiling. */
export function ocrPageLimit(all: boolean): number {
	return all ? OCR_PAGE_MAX : OCR_PAGE_CAP;
}

/** Said before export when there are more scanned pages than this export reads. */
export function ocrCapNotice(scanned: number, all = false): string | null {
	const cap = ocrPageLimit(all);
	return scanned > cap ? `This file has ${scanned} scanned pages. The first ${cap} will be made searchable.` : null;
}

/** "Read all 34 pages" is offered when there are more scanned pages than the first 20. */
export function offerReadAll(scanned: number): boolean {
	return scanned > OCR_PAGE_CAP;
}

/** Its label: "Read all 34 pages", or past the ceiling "Read the first 300 pages". */
export function readAllLabel(scanned: number): string {
	return scanned > OCR_PAGE_MAX ? `Read the first ${OCR_PAGE_MAX} pages` : `Read all ${scanned} pages`;
}

/**
 * Readers the engine runs at once for `cores` (navigator.hardwareConcurrency), as the
 * engine's ocr/stage.ts readerSlots (not imported: the dialog stays engine-free; checked by a test).
 */
export function ocrSlots(cores: number): number {
	return cores >= 4 ? 2 : 1;
}

/**
 * Seconds of one page in one reader (render, orientation, reading; 2026-11-18, the Node
 * run of 100 Letter scans: 7.3 s median, Chrome 5.7 s) and of the rest of the export per
 * page (the layer, its checks, the final check: 0.5 s). Two readers made the 100-page
 * export 4.1 s a page in Node, and the 20-page Chrome export 4.1 s a page.
 */
const READ_S = 7;
const REST_S = 0.6;

/** About how long reading `pages` scanned pages takes, in seconds. */
export function ocrSeconds(pages: number, cores: number): number {
	return pages * (READ_S / ocrSlots(cores) + REST_S);
}

/** "about 3 minutes" (coarse: whole minutes, fives past 10 minutes, then quarter hours past an hour). */
export function aboutTime(seconds: number): string {
	if (seconds < 45) return 'less than a minute';
	const min = seconds / 60;
	if (min < 1.5) return 'about a minute';
	if (min < 10) return `about ${Math.round(min)} minutes`;
	if (min < 60) return `about ${Math.round(min / 5) * 5} minutes`;
	const q = Math.round(min / 15) / 4;
	return q === 1 ? 'about an hour' : `about ${q} hours`;
}

/**
 * The hint under "Read all": its time, honestly, and that the tab has to stay open.
 * `toRead`: the pages still to read (pagesToRead with the ceiling: pages read before are not counted).
 */
export function readAllHint(toRead: number, cores: number): string {
	if (toRead <= 0) return 'Read before on this device: no wait.';
	const t = aboutTime(ocrSeconds(Math.min(toRead, OCR_PAGE_MAX), cores));
	return `Takes ${t}. Keep this tab open while it reads.`;
}

/** "Keep this tab open" while a long reading runs (more pages than the first 20). */
export function ocrKeepOpen(p: ExportProgress | null): boolean {
	return !!p && p.stage === 'ocr' && p.total > OCR_PAGE_CAP && p.done < p.total;
}

export function ocrProgressText(p: ExportProgress | null): string | null {
	if (!p) return null;
	if (p.stage === 'ocr-load') return 'Getting the text reader ready…';
	if (p.stage !== 'ocr') return null;
	// Every page read: the rest is the ordinary build and check.
	if (p.done >= p.total) return null;
	return `Reading page ${p.done + 1} of ${p.total}${p.reused ? ` — ${p.reused} already read` : ''}`;
}

/** The result lines after export. */
export function ocrSummary(r: OcrReport | undefined): string[] {
	if (!r || r.eligible === 0) return [];
	const made = r.searchable.length;
	const left = r.declined.length;
	const out: string[] = [];
	if (made > 0) {
		out.push(
			`${plural(made, 'page')} made searchable.${left ? ` ${plural(left, 'page was', 'pages were')} left as ${left === 1 ? 'it was' : 'they were'} because the text could not be read well enough.` : ''}`
		);
	} else {
		out.push(`No pages were made searchable: the text could not be read well enough. ${left === 1 ? 'The page is' : 'The pages are'} unchanged.`);
	}
	if (r.eligible > r.cap) out.push(`This file has ${r.eligible} scanned pages. Only the first ${r.cap} were read.`);
	return out;
}
