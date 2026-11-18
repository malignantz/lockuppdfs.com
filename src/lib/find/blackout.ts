/**
 * "Mark for blackout" from the Find bar: where the redaction boxes for every match of a
 * search go, and what the search could not see. Pure; no DOM, no store.
 *
 * A match's box is the union of the boxes of the words it touches on its line (the
 * highlighter's word boxes, engine/page-text.ts: the letters plus a margin of a tenth of
 * the font size along the line, kept off the neighbouring lines' ink), so whole words are
 * covered even when the match is part of one. Boxes are in stamp space of each PageRef
 * (find/lines.ts: after its rotation and crop), so a source page shown twice gets a box
 * on each of its pages. Matches are searched on the whole page as turned (the crop does
 * not hide words from this search): a match not wholly inside the visible part is
 * reported, never boxed (a box must lie on the page, and what a crop hides stays in the
 * file). A match an existing redaction box already covers is skipped (Find does not see
 * words under a box at all, so this is a safety net).
 */
import type { PageId, PageRef, PageText, Source, StampBox } from '../core/types';
import { reframeBox } from '../doc/crop';
import type { LayerLine } from './lines';
import { foldedOf, matchLine, MAX_HITS } from './match';

export interface PagePlanInput {
	page: PageRef;
	source: Source | undefined;
	/**
	 * The page's lines on the whole page as turned (find/doc-text.svelte.ts linesOf with
	 * `wholePage`), or null when its words are not known (not read, past the caps).
	 */
	lines: readonly LayerLine[] | null;
	/** The page's words as read (null when not read): an empty list is a page with no readable text. */
	text: PageText | null;
	/** The file's own annotations on the page (PageText.annots of its own words, also when a scan's words stand in). */
	annots?: PageText['annots'];
}

export interface BlackoutPlan {
	/** Boxes to add, in page order. */
	boxes: { pageId: PageId; box: StampBox }[];
	/** Pages that get a box. */
	pages: number;
	/** Matches partly or wholly outside a page's crop: not boxed. */
	cropped: number;
	/** Matches an existing redaction box already covers. */
	covered: number;
	/** More matches than one step marks (match.ts MAX_HITS): nothing is planned. */
	tooMany: boolean;
	/** What the search could not see. */
	unseen: Unseen;
}

export interface Unseen {
	/** Pages with no readable text: pictures, scans not read, PDF pages without words. */
	noText: number;
	/** PDF pages whose words are not known (still being read, or past the reading caps). */
	notRead: number;
	/** Pages with form fields / with comments or other annotations (their text is not searched). */
	fields: number;
	comments: number;
}

const EPS = 1e-6;
const inside = (b: StampBox) => b.x >= -EPS && b.y >= -EPS && b.x + b.w <= 1 + EPS && b.y + b.h <= 1 + EPS;
const contains = (outer: StampBox, b: StampBox, tol = 1e-4) =>
	b.x >= outer.x - tol && b.y >= outer.y - tol && b.x + b.w <= outer.x + outer.w + tol && b.y + b.h <= outer.y + outer.h + tol;

function union(a: StampBox | null, b: StampBox): StampBox {
	if (!a) return { ...b };
	const x0 = Math.min(a.x, b.x);
	const y0 = Math.min(a.y, b.y);
	const x1 = Math.max(a.x + a.w, b.x + b.w);
	const y1 = Math.max(a.y + a.h, b.y + b.h);
	return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

/** The union of the boxes of the words of `line` that characters start..end touch. */
export function wordsBox(line: LayerLine, start: number, end: number): StampBox | null {
	let box: StampBox | null = null;
	for (let k = 0; k < line.starts.length; k++) {
		const ws = line.starts[k];
		const we = k + 1 < line.starts.length ? line.starts[k + 1] - 1 : line.text.length;
		if (Math.min(end, we) > Math.max(start, ws)) box = union(box, line.words[k]);
	}
	return box;
}

/** The box clamped to the page. */
function clamp(b: StampBox): StampBox {
	const x0 = Math.max(0, b.x);
	const y0 = Math.max(0, b.y);
	const x1 = Math.min(1, b.x + b.w);
	const y1 = Math.min(1, b.y + b.h);
	return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

/** Plan the boxes for a folded query (find/match.ts foldQuery) over the document's pages. */
export function planBlackout(inputs: readonly PagePlanInput[], query: string, limit = MAX_HITS): BlackoutPlan {
	const unseen: Unseen = { noText: 0, notRead: 0, fields: 0, comments: 0 };
	const boxes: BlackoutPlan['boxes'] = [];
	const withBox = new Set<PageId>();
	let cropped = 0;
	let covered = 0;
	let found = 0;
	let tooMany = false;
	for (const { page, source, lines, text, annots: own } of inputs) {
		if (!source || source.kind === 'blank') continue;
		if (source.kind === 'image') {
			unseen.noText++;
			continue;
		}
		const annots = own ?? text?.annots;
		if (annots?.fields) unseen.fields++;
		if (annots?.comments) unseen.comments++;
		if (!text || !lines) {
			if (!text) unseen.notRead++;
			else unseen.noText++;
			continue;
		}
		if (!text.words.length) {
			unseen.noText++;
			continue;
		}
		if (!query || tooMany) continue;
		const redacts = page.stamps.flatMap((s) => (s.kind === 'redact' ? [s.box] : []));
		const seen: StampBox[] = [];
		for (const line of lines) {
			for (const h of matchLine(foldedOf(line), query)) {
				if (++found > limit) {
					tooMany = true;
					break;
				}
				const whole = wordsBox(line, h.start, h.end);
				if (!whole) continue;
				const shown = page.crop ? reframeBox(whole, undefined, page.crop) : whole;
				if (!inside(shown)) {
					cropped++;
					continue;
				}
				const box = clamp(shown);
				if (!(box.w > 0 && box.h > 0)) continue;
				if (redacts.some((r) => contains(r, box))) {
					covered++;
					continue;
				}
				// Two matches in the same words (a term found twice in one word) get one box.
				if (seen.some((s) => contains(s, box, 1e-6) && contains(box, s, 1e-6))) continue;
				seen.push(box);
				boxes.push({ pageId: page.id, box });
				withBox.add(page.id);
			}
			if (tooMany) break;
		}
	}
	if (tooMany) return { boxes: [], pages: 0, cropped: 0, covered: 0, tooMany, unseen };
	return { boxes, pages: withBox.size, cropped, covered, tooMany, unseen };
}

const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString('en-US')} ${n === 1 ? one : many}`;

/** The confirm's title: "Add 12 blackout boxes on 4 pages?" */
export function confirmTitle(p: Pick<BlackoutPlan, 'boxes' | 'pages'>): string {
	return `Add ${plural(p.boxes.length, 'blackout box', 'blackout boxes')} on ${plural(p.pages, 'page')}?`;
}

/** What search could not see in this document, one plain line each (always ends with the line-break rule). */
export function unseenLines(p: Pick<BlackoutPlan, 'unseen' | 'cropped'>, reading: boolean): string[] {
	const u = p.unseen;
	const out: string[] = [];
	if (u.noText) out.push(`${plural(u.noText, 'page')} with no readable text (scans or pictures). Look at ${u.noText === 1 ? 'it' : 'them'} yourself.`);
	if (u.notRead)
		out.push(
			reading
				? `${plural(u.notRead, 'page')} not read yet. Wait for reading to finish, then search again.`
				: `${plural(u.notRead, 'page')} past what search reads in a long document.`
		);
	if (u.fields) out.push(`Text in form fields (on ${plural(u.fields, 'page')}).`);
	if (u.comments) out.push(`Comments and notes (on ${plural(u.comments, 'page')}).`);
	if (p.cropped)
		out.push(`${plural(p.cropped, 'match', 'matches')} in parts of pages hidden by a crop. They stay in the file, so the export will stop until you remove the crop and black them out.`);
	out.push('A phrase broken across two lines or hyphenated, and words inside pictures.');
	return out;
}

/** The toast after marking: "12 blackout boxes added. They're applied when you export." */
export function markedToast(n: number): string {
	return `${plural(n, 'blackout box', 'blackout boxes')} added. They’re applied when you export.`;
}
