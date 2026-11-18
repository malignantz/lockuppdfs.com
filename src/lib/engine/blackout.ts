/**
 * The blackout check (ExportOptions.blackoutTerms, VerifyCheck 'blackout'): after every
 * other check, the FINAL exported file is read again and none of the words the person
 * blacked out with Find may still be in it.
 *
 * Read with the password, if any:
 * - Page text, MuPDF structured text of every page as the file runs it (annotation and
 *   field appearances included), with hidden layers made visible, nothing clipped away
 *   (text outside the crop or under a clip path counts), read twice: with ActualText
 *   replacements and with the glyphs themselves. Lines joined, hyphenated line ends
 *   rejoined (blackout-text.ts). This is more than Find sees.
 * - Every text string left anywhere in the file (qpdf's JSON of every object): form field
 *   values and names, comment and annotation contents, titles, bookmarks, names of
 *   attachments, tags' alternate text. A string reached from a page's annotations is said
 *   to be on that page.
 * Not readable here: words drawn as a picture (a scan with no text: such pages are listed
 * as unchecked, never claimed clean) or as outlines, and data inside streams other than
 * page content (attached files, scripts in streams).
 */
import type * as MU from 'mupdf';
import type { BlackoutReport, VerifyCheck } from '../core/types';
import type { EngineDeps } from './deps';
import { rethrowFault } from './mupdf';
import { QPDF_OK, QPDF_WARNINGS } from './qpdf';
import { MAX_TERMS, MAX_TERM_LENGTH, termForm, termKey, termsIn, termsInString, type TermForm } from './blackout-text';
import { EngineError } from './errors';

type Doc = MU.PDFDocument;

const destroy = (o: unknown) => {
	try {
		(o as { destroy?: () => void })?.destroy?.();
	} catch {
		// Already gone.
	}
};

/** Where a term was found. `page` is 1-based; null: not tied to a page. */
export interface TermHit {
	term: string;
	page: number | null;
	where: 'text' | 'field' | 'comment' | 'file';
}

/** Validated, de-duplicated terms (one per termKey), in the order given. */
export function blackoutForms(terms: readonly string[] | undefined): TermForm[] {
	if (!terms || !terms.length) return [];
	if (!Array.isArray(terms) || terms.length > MAX_TERMS) throw new EngineError('unsupported', `At most ${MAX_TERMS} blacked-out words can be checked in one export.`);
	const seen = new Set<string>();
	const out: TermForm[] = [];
	for (const t of terms) {
		if (typeof t !== 'string' || t.length > MAX_TERM_LENGTH) throw new EngineError('unsupported', 'A blacked-out word to check is too long.');
		const f = termForm(t);
		if (!f) throw new EngineError('unsupported', 'A blacked-out word to check is empty.');
		const k = termKey(t);
		if (seen.has(k)) continue;
		seen.add(k);
		out.push(f);
	}
	return out;
}

/** The lines of a page's structured text, and whether the page shows a picture. */
function readPage(page: MU.PDFPage, opts: string): { lines: string[]; chars: number; images: number } {
	const lines: string[] = [];
	let chars = 0;
	let images = 0;
	const st = page.toStructuredText(opts);
	try {
		st.walk({
			onImageBlock() {
				images++;
			},
			beginLine() {
				lines.push('');
			},
			onChar(c) {
				if (!lines.length) lines.push('');
				lines[lines.length - 1] += c;
				if (c.trim()) chars++;
			}
		});
	} finally {
		destroy(st);
	}
	return { lines, chars, images };
}

/** A decrypted copy of the document without /OCProperties, so every layer is visible. */
function allLayers(m: typeof import('mupdf'), doc: Doc): Doc {
	const save = (d: Doc, o: string) => {
		const buf = d.saveToBuffer(o);
		try {
			return buf.asUint8Array().slice();
		} finally {
			destroy(buf);
		}
	};
	const copy = new m.PDFDocument(save(doc, 'encrypt=none'));
	try {
		copy.getTrailer().get('Root').delete('OCProperties');
		return new m.PDFDocument(save(copy, ''));
	} finally {
		destroy(copy);
	}
}

/** Terms in the page text of every page; pages with no text but a picture are `unchecked`. */
export async function pageTextHits(deps: EngineDeps, bytes: Uint8Array, terms: readonly TermForm[], password?: string): Promise<{ hits: TermHit[]; unchecked: number[]; pages: number }> {
	const m = await deps.mupdf();
	const hits: TermHit[] = [];
	const unchecked: number[] = [];
	let doc: Doc | null = null;
	try {
		doc = new m.PDFDocument(bytes);
		if (doc.needsPassword() && (password === undefined || doc.authenticatePassword(password) === 0)) throw new Error('the file did not open with its password');
		if (!doc.getTrailer().get('Root').get('OCProperties').isNull()) {
			const plain = allLayers(m, doc);
			destroy(doc);
			doc = plain;
		}
		const n = doc.countPages();
		for (let i = 0; i < n; i++) {
			const page = doc.loadPage(i);
			try {
				const a = readPage(page, 'preserve-whitespace,clip=no,preserve-images');
				const b = readPage(page, 'preserve-whitespace,clip=no,ignore-actualtext');
				const found = new Set<string>();
				for (const t of [...termsIn(a.lines, terms), ...termsIn(b.lines, terms)]) {
					if (found.has(t.term)) continue;
					found.add(t.term);
					hits.push({ term: t.term, page: i + 1, where: 'text' });
				}
				if (a.chars === 0 && b.chars === 0 && a.images > 0) unchecked.push(i + 1);
			} finally {
				destroy(page);
			}
		}
		return { hits, unchecked, pages: n };
	} catch (e) {
		rethrowFault(e);
		throw e;
	} finally {
		if (doc) destroy(doc);
	}
}

// ---------------------------------------------------------------- strings in the file

interface JsonObject {
	value?: unknown;
	stream?: { dict?: unknown };
}

const isRef = (v: unknown): v is string => typeof v === 'string' && /^\d+ \d+ R$/.test(v);
const isDict = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

/** A qpdf JSON string's text ("u:" text, "b:" hex bytes read as UTF-16 or Latin-1); null for anything else. */
export function jsonString(v: unknown): string | null {
	if (typeof v !== 'string') return null;
	if (v.startsWith('u:')) return v.slice(2);
	if (v.startsWith('b:')) {
		const hex = v.slice(2);
		if (hex.length % 2 || !/^[0-9a-f]*$/i.test(hex)) return null;
		const bytes = new Uint8Array(hex.length / 2);
		for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
		if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder('utf-16be').decode(bytes.subarray(2));
		if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder('utf-16le').decode(bytes.subarray(2));
		let s = '';
		for (const b of bytes) s += String.fromCharCode(b);
		return s;
	}
	return null;
}

/**
 * Every string in a value, not following references. Names are left out: they are the
 * file's own vocabulary (/Font, /Page), which a short term would match in every file.
 */
function stringsOf(v: unknown, out: string[], depth = 0): void {
	if (depth > 64) return;
	const s = jsonString(v);
	if (s !== null) out.push(s);
	else if (Array.isArray(v)) for (const x of v) stringsOf(x, out, depth + 1);
	else if (isDict(v)) for (const x of Object.values(v)) stringsOf(x, out, depth + 1);
}

const dictOf = (o: JsonObject | undefined): Record<string, unknown> | null => (o ? (isDict(o.value) ? o.value : isDict(o.stream?.dict) ? (o.stream!.dict as Record<string, unknown>) : null) : null);

/** Page number (1-based) and kind of every object reached from a page's annotations. */
function annotationOwners(objects: Record<string, JsonObject>): Map<string, { page: number; where: 'field' | 'comment' }> {
	const get = (ref: unknown) => (isRef(ref) ? dictOf(objects[`obj:${ref}`]) : isDict(ref) ? ref : null);
	const owners = new Map<string, { page: number; where: 'field' | 'comment' }>();
	const trailer = dictOf(objects.trailer);
	const root = get(trailer?.['/Root']);
	const pages: Record<string, unknown>[] = [];
	const seen = new Set<string>();
	const walk = (node: unknown, depth: number) => {
		if (depth > 64) return;
		if (isRef(node)) {
			if (seen.has(node)) return;
			seen.add(node);
		}
		const d = get(node);
		if (!d) return;
		if (Array.isArray(d['/Kids'])) for (const k of d['/Kids']) walk(k, depth + 1);
		else pages.push(d);
	};
	walk(root?.['/Pages'], 0);
	pages.forEach((p, i) => {
		const annots = isRef(p['/Annots']) ? objects[`obj:${p['/Annots']}`]?.value : p['/Annots'];
		if (!Array.isArray(annots)) return;
		for (const a of annots) {
			const d = get(a);
			if (!d) continue;
			const where = d['/Subtype'] === '/Widget' || '/FT' in d ? 'field' : 'comment';
			const claim = (ref: unknown) => {
				if (isRef(ref) && !owners.has(ref)) owners.set(ref, { page: i + 1, where });
			};
			claim(a);
			claim(d['/Popup']);
			// A field's value and name may sit on its parents.
			let parent = d['/Parent'];
			for (let k = 0; k < 32 && isRef(parent) && !owners.has(parent); k++) {
				claim(parent);
				parent = get(parent)?.['/Parent'];
			}
		}
	});
	return owners;
}

/** Terms in the text strings of every object of the file (see the module comment). */
export async function stringHits(deps: EngineDeps, bytes: Uint8Array, terms: readonly TermForm[], password?: string): Promise<TermHit[]> {
	const pw = password !== undefined ? [`--password=${password}`] : [];
	const res = await deps.qpdf.run({
		args: [...pw, '--json-output', '--json-stream-data=none', '/b.pdf', '/b.json'],
		inputs: { '/b.pdf': bytes },
		outputs: ['/b.json']
	});
	const file = res.files.get('/b.json');
	if ((res.code !== QPDF_OK && res.code !== QPDF_WARNINGS) || !file) throw new Error('qpdf could not list the objects of the file');
	const parsed = JSON.parse(new TextDecoder().decode(file)) as { qpdf: [unknown, Record<string, JsonObject>] };
	const objects = parsed.qpdf[1];
	const owners = annotationOwners(objects);
	const hits: TermHit[] = [];
	const seen = new Set<string>();
	for (const [key, obj] of Object.entries(objects)) {
		const strings: string[] = [];
		stringsOf(obj.value ?? obj.stream?.dict, strings);
		if (!strings.length) continue;
		const ref = key.startsWith('obj:') ? key.slice(4) : '';
		const owner = owners.get(ref);
		for (const s of strings) {
			for (const t of termsInString(s, terms)) {
				const id = `${t.term}\0${owner?.page ?? ''}\0${owner?.where ?? 'file'}`;
				if (seen.has(id)) continue;
				seen.add(id);
				hits.push({ term: t.term, page: owner?.page ?? null, where: owner?.where ?? 'file' });
			}
		}
	}
	return hits;
}

// ---------------------------------------------------------------- the check

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const quoted = (t: string) => `“${t}”`;

/** "pages 3, 5 and 9" */
export function pageList(pages: readonly number[]): string {
	if (pages.length === 1) return `page ${pages[0]}`;
	const shown = pages.slice(0, 8);
	const rest = pages.length - shown.length;
	if (rest > 0) return `pages ${shown.join(', ')} and ${rest} more`;
	return `pages ${shown.slice(0, -1).join(', ')} and ${shown[shown.length - 1]}`;
}

/** The sentence the person reads when a term is left (the first one found). */
export function leftMessage(h: TermHit): string {
	const t = quoted(h.term);
	if (h.where === 'text' && h.page !== null)
		return `${t} still appears on page ${h.page} (it may wrap across lines or sit in a scanned picture). Nothing was saved. Black it out on page ${h.page} and export again.`;
	if (h.where === 'field' && h.page !== null) return `${t} still appears in a form field on page ${h.page}. Nothing was saved. Black out the field on page ${h.page} and export again.`;
	if (h.where === 'comment' && h.page !== null) return `${t} still appears in a comment on page ${h.page}. Nothing was saved. Black out the comment on page ${h.page} and export again.`;
	return `${t} still appears in the file’s hidden text (such as a bookmark, title or attachment name). Nothing was saved. Turn on Remove hidden details, or black out a page area, and export again.`;
}

/** One detail line per hit. */
function hitLine(h: TermHit): string {
	const where = h.where === 'text' ? 'in the text' : h.where === 'field' ? 'in a form field' : h.where === 'comment' ? 'in a comment' : 'in a text string not tied to a page';
	return `${quoted(h.term)} ${where}${h.page !== null ? ` on page ${h.page}` : ''}.`;
}

export interface BlackoutVerdict {
	check: VerifyCheck;
	report: BlackoutReport;
	/** The first term left, in plain words (failed only). */
	message?: string;
}

/** Read the final file and decide the 'blackout' check (see the module comment). */
export async function verifyBlackout(deps: EngineDeps, bytes: Uint8Array, terms: readonly TermForm[], password?: string): Promise<BlackoutVerdict> {
	const report: BlackoutReport = { terms: terms.map((t) => t.term), unchecked: [] };
	let text: Awaited<ReturnType<typeof pageTextHits>>;
	let strings: TermHit[];
	try {
		text = await pageTextHits(deps, bytes, terms, password);
		strings = await stringHits(deps, bytes, terms, password);
	} catch (e) {
		rethrowFault(e);
		const detail = `The exported file could not be read to check the blacked-out words (${e instanceof Error ? e.message : String(e)}).`;
		return { check: { name: 'blackout', ok: false, detail }, report, message: 'The exported file could not be read to check that the blacked-out words are gone. Nothing was saved. Try again.' };
	}
	report.unchecked = text.unchecked;
	const hits = [...text.hits, ...strings].sort((a, b) => (a.page ?? Infinity) - (b.page ?? Infinity));
	if (hits.length) {
		const lines = hits.slice(0, 20).map(hitLine);
		if (hits.length > 20) lines.push(`…and ${hits.length - 20} more.`);
		return { check: { name: 'blackout', ok: false, detail: `Still in the file: ${lines.join(' ')}` }, report, message: leftMessage(hits[0]) };
	}
	const words = terms.length === 1 ? quoted(terms[0].term) : `${plural(terms.length, 'blacked-out word')} (${terms.map((t) => quoted(t.term)).join(', ')})`;
	let detail = `${words} checked on ${plural(text.pages, 'page')}: not in the page text (lines joined, hyphenated line ends rejoined, hidden layers and cropped parts included), form fields, comments or any other text in the file.`;
	if (text.unchecked.length)
		detail += ` Could not be checked: ${pageList(text.unchecked)} ${text.unchecked.length === 1 ? 'is a picture' : 'are pictures'} with no text.`;
	return { check: { name: 'blackout', ok: true, detail }, report };
}
