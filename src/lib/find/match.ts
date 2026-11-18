/**
 * Matching for the Find bar: case-insensitive, accent-insensitive and tolerant of
 * spacing and typographic look-alikes (ligatures, curly quotes, dashes), against the
 * same line strings the invisible text layer holds (find/lines.ts). Matches never
 * cross a line. Offsets in results are in the line's own text, so they map straight
 * onto its text node (CSS Custom Highlight ranges). Pure; no DOM.
 */

export interface Folded {
	/** The folded text. */
	text: string;
	/** For each folded character, the offset of the original character it came from; one more entry: the original length. */
	map: number[];
}

const DASHES = /[‐-―−⸺⸻﹘﹣－]/g;
const SINGLE_QUOTES = /[‘’‚‛′ʼ]/g;
const DOUBLE_QUOTES = /[“”„‟″«»]/g;
/** Characters dropped: soft hyphen, zero-width spaces and joiners, byte-order mark. */
const DROPPED = /[­​-‍⁠﻿]/g;
const MARKS = /\p{M}/gu;
const SPACE = /\s/u;

/** One original character (a code point), folded; may be empty or several characters. */
function foldChar(c: string): string {
	return c
		.normalize('NFKD')
		.toLowerCase()
		.normalize('NFKD')
		.replace(MARKS, '')
		.replace(DROPPED, '')
		.replace(DASHES, '-')
		.replace(SINGLE_QUOTES, "'")
		.replace(DOUBLE_QUOTES, '"');
}

/** Fold a string, keeping where each folded character came from. Runs of space become one space; ends are kept. */
export function fold(s: string): Folded {
	let text = '';
	const map: number[] = [];
	let i = 0;
	for (const c of s) {
		if (SPACE.test(c)) {
			if (!text.endsWith(' ')) {
				text += ' ';
				map.push(i);
			}
		} else {
			for (const f of foldChar(c)) {
				if (SPACE.test(f)) {
					if (text.endsWith(' ')) continue;
					text += ' ';
				} else text += f;
				map.push(i);
			}
		}
		i += c.length;
	}
	map.push(s.length);
	return { text, map };
}

/** The query as searched: folded, spaces collapsed, ends trimmed. Empty means no search. */
export function foldQuery(q: string): string {
	return fold(q).text.trim();
}

export interface LineHit {
	/** Offsets in the line's original text. */
	start: number;
	end: number;
}

/** Non-overlapping matches of a folded query in one line, left to right. */
export function matchLine(line: Folded, query: string): LineHit[] {
	if (!query) return [];
	const out: LineHit[] = [];
	let from = 0;
	for (;;) {
		const at = line.text.indexOf(query, from);
		if (at < 0) break;
		const endF = at + query.length;
		// The match ends after the original character its last folded character came from
		// (a ligature folds to several characters: a match ending inside it takes it whole).
		const last = line.map[endF - 1];
		let k = endF;
		while (k < line.map.length - 1 && line.map[k] === last) k++;
		out.push({ start: line.map[at], end: line.map[k] });
		from = endF;
	}
	return out;
}

const folded = new WeakMap<object, Folded>();

/** fold() of an object's `text`, kept with the object (line objects are reused while the page is unchanged). */
export function foldedOf(line: { text: string }): Folded {
	let f = folded.get(line);
	if (!f) {
		f = fold(line.text);
		folded.set(line, f);
	}
	return f;
}

/** Most matches listed (and painted); the count says "more than" past it. */
export const MAX_HITS = 5000;

export interface DocHit {
	/** Index of the page in the document's order. */
	page: number;
	line: number;
	start: number;
	end: number;
}

/**
 * Matches of a folded query on every page, in page order then reading order. `pages[i]`
 * is the lines of the document's page i, or null when not known (not read yet, no text).
 */
export function matchPages(pages: readonly (readonly { text: string }[] | null)[], query: string, limit = MAX_HITS): { hits: DocHit[]; truncated: boolean } {
	const hits: DocHit[] = [];
	if (!query) return { hits, truncated: false };
	for (let p = 0; p < pages.length; p++) {
		const lines = pages[p];
		if (!lines) continue;
		for (let l = 0; l < lines.length; l++) {
			for (const h of matchLine(foldedOf(lines[l]), query)) {
				if (hits.length >= limit) return { hits, truncated: true };
				hits.push({ page: p, line: l, start: h.start, end: h.end });
			}
		}
	}
	return { hits, truncated: false };
}
