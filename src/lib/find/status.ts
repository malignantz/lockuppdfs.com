/** The Find bar's words (pure). */

export interface FindFacts {
	/** The folded query; empty when nothing is searched. */
	query: string;
	hits: number;
	/** More matches than are listed (match.ts MAX_HITS). */
	truncated: boolean;
	/** Index of the current match, or -1. */
	current: number;
	/** Pages with a match. */
	pages: number;
	/** Pages still being read, or null when reading is over (or not started). */
	reading: { done: number; total: number } | null;
	/** Every page was read and none has text. */
	noText: boolean;
	/** Pages left out by the caps (doc-text.svelte.ts). */
	skipped: number;
}

export interface FindWords {
	/** Beside the field: "3 of 12", "12 matches". */
	count: string;
	/** After the count where there is room: "on 4 pages". */
	where: string;
	/** For screen readers (a polite live region): "3 of 12 matches on 4 pages". */
	said: string;
	/** Under the field: totals, reading progress, caps. */
	note: string;
}

const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString('en-US')} ${n === 1 ? one : many}`;

export function findStatus(f: FindFacts): FindWords {
	const n = f.truncated ? `more than ${f.hits.toLocaleString('en-US')}` : f.hits.toLocaleString('en-US');
	const matches = f.truncated ? `${n} matches` : plural(f.hits, 'match', 'matches');
	const reading = f.reading ? `Reading pages: ${f.reading.done.toLocaleString('en-US')} of ${f.reading.total.toLocaleString('en-US')}.` : '';
	const capped = f.skipped > 0 ? `${plural(f.skipped, 'page')} at the end ${f.skipped === 1 ? 'is' : 'are'} not searched (a very long document).` : '';
	const join = (...parts: string[]) => parts.filter(Boolean).join(' ');

	if (f.noText && !f.reading) return { count: '', where: '', said: 'No searchable text in this document.', note: join('No searchable text in this document.', capped) };
	if (!f.query) return { count: '', where: '', said: '', note: join(reading, capped) };
	if (!f.hits) {
		const said = f.reading ? 'No matches yet' : 'No matches';
		return { count: f.reading ? '' : 'No matches', where: '', said, note: join(f.reading ? 'No matches yet.' : '', reading, capped) };
	}
	const where = `on ${plural(f.pages, 'page')}`;
	const count = f.current >= 0 ? `${(f.current + 1).toLocaleString('en-US')} of ${n}` : matches;
	const said = f.current >= 0 ? `${count} matches ${where}` : `${matches} ${where}`;
	return { count, where, said, note: join(f.reading ? `${matches} ${where} so far.` : '', reading, capped) };
}
