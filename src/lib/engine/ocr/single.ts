/**
 * The editor's background reader (Engine.readScanPage): one scanned page at a time,
 * read exactly as the export's "Make scanned pages searchable" reads it (stage.ts:
 * the same render, orientation and script check, OCR settings, gate and word filter),
 * so its outcome can be reused by an export instead of reading the page again.
 *
 * Workers: one reader and one orientation worker (the export uses two readers; this
 * runs in the background, so one core at most is busy reading). A worker that fails is
 * replaced and the page tried once more, then declined; the reader is replaced every
 * REPLACE_AFTER pages, as in the export.
 *
 * Words: an accepted read is turned into the editor's word model by writing the very
 * layer the export writes (layer.ts) onto a one-page copy of the page, then reading
 * that page's words with the highlighter's reader (page-text.ts). So the words, their
 * boxes and their lines are those the exported file will give, with the band rule for
 * invisible text the measurement checked.
 */

import type * as MU from 'mupdf';
import type { PageText } from '../../core/types';
import type { EngineDeps } from '../deps';
import { rethrowFault, type Mupdf } from '../mupdf';
import { pageTextOf } from '../page-text';
import { OCR_DPI } from './eligible';
import { writeLayers } from './layer';
import { REPLACE_AFTER, judge, renderForOcr, type OcrBackend, type OcrOrienter, type OcrReader, type PageOutcome } from './stage';
import type { OcrRead } from './tess';

export interface SingleRead {
	outcome: PageOutcome;
	text: PageText;
	ms: { render: number; orient: number; read: number; words: number };
}

const EMPTY: PageText = Object.freeze({ words: [], skipped: 0 }) as PageText;
const now = () => performance.now();

export class ScanPageReader {
	private backend: Promise<OcrBackend> | null = null;
	private reader: OcrReader | null = null;
	private orienter: OcrOrienter | null = null;
	private used = 0;
	/** One page at a time: calls wait for the one before. */
	private chain: Promise<unknown> = Promise.resolve();

	constructor(
		private readonly load: () => Promise<OcrBackend>,
		private readonly debug: (note: string) => void = () => {}
	) {}

	/** Reads page `pageIndex` of `doc` (an opened source). Never throws for a page it cannot read: it declines. */
	read(deps: EngineDeps, m: Mupdf, doc: MU.Document, pageIndex: number): Promise<SingleRead> {
		const run = () => this.readNow(deps, m, doc, pageIndex);
		const p = this.chain.then(run, run);
		this.chain = p.catch(() => undefined);
		return p;
	}

	/** Stops the OCR workers (they start again on the next read). */
	stop(): void {
		for (const w of [this.reader, this.orienter]) {
			try {
				w?.terminate();
			} catch {
				// Gone.
			}
		}
		this.reader = null;
		this.orienter = null;
		this.used = 0;
	}

	private async readNow(deps: EngineDeps, m: Mupdf, doc: MU.Document, pageIndex: number): Promise<SingleRead> {
		const ms = { render: 0, orient: 0, read: 0, words: 0 };
		let t = now();
		let img: { png: Uint8Array; w: number; h: number } | null = null;
		try {
			img = renderForOcr(m, doc, pageIndex);
		} catch (e) {
			rethrowFault(e);
			this.debug(`scan reader: could not render page ${pageIndex + 1}: ${String(e)}`);
		}
		ms.render = now() - t;
		if (!img) return { outcome: { ok: false, why: 'failed' }, text: EMPTY, ms };
		this.backend ??= this.load().catch((e) => {
			this.backend = null;
			throw e;
		});
		let backend: OcrBackend;
		try {
			backend = await this.backend;
		} catch (e) {
			this.debug(`scan reader: the OCR engine did not load: ${String(e)}`);
			return { outcome: { ok: false, why: 'failed' }, text: EMPTY, ms };
		}

		t = now();
		let orientation = null;
		for (let attempt = 0; attempt < 2 && !orientation; attempt++) {
			try {
				this.orienter ??= await backend.orienter();
				orientation = await this.orienter.detect(img.png);
			} catch (e) {
				this.debug(`scan reader: orientation worker failed (${String(e)}); replacing it`);
				this.drop('orienter');
			}
		}
		ms.orient = now() - t;
		if (!orientation) return { outcome: { ok: false, why: 'failed' }, text: EMPTY, ms };
		if (orientation.angle !== 0) return { outcome: { ok: false, why: 'orientation' }, text: EMPTY, ms };
		if (orientation.script !== 'Latin') return { outcome: { ok: false, why: 'script' }, text: EMPTY, ms };

		t = now();
		let raw: OcrRead | undefined;
		for (let attempt = 0; attempt < 2 && !raw; attempt++) {
			if (this.reader && this.used >= REPLACE_AFTER) this.drop('reader');
			try {
				if (!this.reader) {
					this.reader = await backend.reader();
					this.used = 0;
				}
				this.used++;
				raw = await this.reader.read(img.png, img.w, img.h, OCR_DPI);
			} catch (e) {
				this.debug(`scan reader: reader failed on page ${pageIndex + 1} (${String(e)}); replacing it`);
				this.drop('reader');
			}
		}
		ms.read = now() - t;
		if (!raw) return { outcome: { ok: false, why: 'failed' }, text: EMPTY, ms };
		const outcome = judge(raw);
		if (!outcome.ok) return { outcome, text: EMPTY, ms };

		t = now();
		let text = EMPTY;
		try {
			text = await wordsOf(deps, m, doc, pageIndex, outcome.read);
		} catch (e) {
			rethrowFault(e);
			this.debug(`scan reader: words of page ${pageIndex + 1} could not be laid out: ${String(e)}`);
		}
		ms.words = now() - t;
		return { outcome, text, ms };
	}

	private drop(which: 'reader' | 'orienter') {
		const w = this[which];
		this[which] = null;
		try {
			w?.terminate();
		} catch {
			// Gone.
		}
	}
}

/**
 * The words the export's layer gives page `pageIndex`: the page copied alone into a new
 * file (MuPDF graft: its content, resources and inherited boxes and /Rotate), the layer
 * written onto it (layer.ts, no user rotation), its words read back (page-text.ts).
 * Boxes are fractions of the page as displayed, as Engine.pageText gives them.
 */
export async function wordsOf(deps: EngineDeps, m: Mupdf, doc: MU.Document, pageIndex: number, read: OcrRead): Promise<PageText> {
	const src = doc.asPDF();
	if (!src) return EMPTY;
	const one = new m.PDFDocument();
	let bytes: Uint8Array;
	try {
		one.graftPage(-1, src, pageIndex);
		const buf = one.saveToBuffer('');
		try {
			bytes = buf.asUint8Array().slice();
		} finally {
			buf.destroy();
		}
	} finally {
		one.destroy();
	}
	const lib = await deps.pdfLib();
	const r = await writeLayers(lib, bytes, [{ pageIndex: 0, userRotation: 0, read, dpi: OCR_DPI }]);
	if (!r.written.has(0)) return EMPTY;
	const out = m.Document.openDocument(r.bytes, 'application/pdf');
	try {
		return pageTextOf(out, 0, { m });
	} finally {
		out.destroy();
		m.emptyStore();
	}
}
