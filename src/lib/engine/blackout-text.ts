/**
 * The text side of the blackout check (ExportOptions.blackoutTerms, engine/blackout.ts):
 * does a term still appear in some text? Pure; no engine.
 *
 * Deliberately more thorough than Find (find/match.ts), which matches within one line:
 * - the same folding (case, accents, ligatures, curly quotes, dashes, soft hyphens, runs of
 *   space), so anything Find would find is found here too;
 * - lines are joined, so a phrase broken across two lines is found ("Jane" / "Doe");
 * - a hyphenated line end is rejoined both without the hyphen ("Do-" / "e" reads "Doe") and
 *   with it ("co-" / "worker" reads "co-worker");
 * - spaces and hyphens are also ignored altogether, where the match starts and ends at the
 *   edge of a word ("J a n e  D o e", "JaneDoe", "Jane-Doe" all contain "Jane Doe"). The
 *   word-edge rule keeps "ann" from being found across "Joan Nelson", which nobody could
 *   black out; "ann" inside "planning" is still found, as Find finds it.
 * A false "still there" stops an export the person can then look at; a missed one would
 * deliver a file with the word in it, so every rule leans towards finding.
 */
import { fold } from '../find/match';

export interface TermForm {
	/** The term as the person marked it. */
	term: string;
	/** Folded, spaces collapsed, trimmed. */
	spaced: string;
	/** Folded with every space and hyphen removed. */
	compact: string;
}

const SQUEEZE = /[\s-]/gu;
const WORDISH = /[\p{L}\p{N}]/u;
/** A line ending in one of these, followed by a letter, is a hyphenated line end. */
const HYPHEN_END = /[-‐‑­]$/u;

/** A term in the forms the check searches for; null when nothing is left to search. */
export function termForm(term: string): TermForm | null {
	const spaced = fold(term).text.trim();
	const compact = spaced.replace(SQUEEZE, '');
	if (!compact) return null;
	return { term, spaced, compact };
}

/** The key two terms share when the check treats them as the same (one entry per key). */
export function termKey(term: string): string {
	return fold(term).text.trim();
}

export interface Joined {
	/** Lines joined by a space; hyphenated line ends rejoined without the hyphen. */
	joined: string;
	/** The same, hyphenated line ends rejoined keeping the hyphen. */
	kept: string;
}

/** Fold and join the lines of one flow of text (a page, a string split at its line breaks). */
export function joinLines(lines: readonly string[]): Joined {
	let joined = '';
	let kept = '';
	let hyphenated = false;
	for (let i = 0; i < lines.length; i++) {
		const raw = lines[i].replace(/\s+$/u, '');
		const f = fold(raw).text.trim();
		const next = lines[i + 1];
		const sep = (s: string) => (s && !hyphenated ? ' ' : '');
		joined += sep(joined) + f;
		kept += sep(kept) + f;
		// A hyphen at the end, a letter starting the next line: one word broken in two.
		hyphenated = false;
		if (next !== undefined && HYPHEN_END.test(raw) && /^\s*\p{L}/u.test(next)) {
			hyphenated = true;
			// fold() drops a soft hyphen: only a visible one has to come off.
			if (joined.endsWith('-')) joined = joined.slice(0, -1);
		}
	}
	return { joined, kept };
}

/** Whether `t` appears in one joined flow of text (see the module comment for the rules). */
export function containsTerm(text: Joined, t: TermForm): boolean {
	if (t.spaced && (text.joined.includes(t.spaced) || text.kept.includes(t.spaced))) return true;
	return compactHit(text.joined, t.compact) || compactHit(text.kept, t.compact);
}

/** `compact` in `s` with spaces and hyphens ignored, starting and ending at word edges. */
function compactHit(s: string, compact: string): boolean {
	if (!compact) return false;
	const chars: string[] = [];
	const at: number[] = [];
	const cps = [...s];
	for (let i = 0; i < cps.length; i++) {
		const c = cps[i];
		if (c === '-' || /\s/u.test(c)) continue;
		chars.push(c);
		at.push(i);
	}
	const squeezed = chars.join('');
	const want = [...compact];
	const wordAt = (i: number) => i >= 0 && i < cps.length && WORDISH.test(cps[i]);
	let from = 0;
	for (;;) {
		const k = squeezed.indexOf(compact, from);
		if (k < 0) return false;
		// `squeezed` is joined from code points: map the string offset back to a code point index.
		const startCp = [...squeezed.slice(0, k)].length;
		const endCp = startCp + want.length - 1;
		const first = at[startCp];
		const last = at[endCp];
		const startOk = !WORDISH.test(cps[first]) || !wordAt(first - 1);
		const endOk = !WORDISH.test(cps[last]) || !wordAt(last + 1);
		if (startOk && endOk) return true;
		from = k + 1;
	}
}

/** The terms found in some lines of text, in the order of `terms`. */
export function termsIn(lines: readonly string[], terms: readonly TermForm[]): TermForm[] {
	if (!lines.length || !terms.length) return [];
	const text = joinLines(lines);
	return terms.filter((t) => containsTerm(text, t));
}

/** The terms found in one text string of the file (its line breaks are line ends). */
export function termsInString(s: string, terms: readonly TermForm[]): TermForm[] {
	return termsIn(s.split(/\r\n|\r|\n/), terms);
}

/** Most terms one export checks, and the longest term. */
export const MAX_TERMS = 50;
export const MAX_TERM_LENGTH = 200;
