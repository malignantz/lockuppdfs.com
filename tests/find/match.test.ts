/** Find's matching (find/match.ts): folding, offsets back into the line, page order, the cap. */
import { describe, expect, it } from 'vitest';
import { fold, foldQuery, matchLine, matchPages } from '../../src/lib/find/match';

const hits = (text: string, q: string) => matchLine(fold(text), foldQuery(q)).map((h) => text.slice(h.start, h.end));

describe('fold', () => {
	it('ignores case and accents', () => {
		expect(fold('Café Crème BRÛLÉE').text).toBe('cafe creme brulee');
		expect(hits('Café crème brûlée for the team', 'creme brulee')).toEqual(['crème brûlée']);
		expect(hits('Ångström', 'angstrom')).toEqual(['Ångström']);
	});

	it('maps decomposed letters back to the whole original character', () => {
		// "e" + combining acute: two characters in the line, one folded "e".
		const text = 'café au lait';
		expect(hits(text, 'café')).toEqual(['café']);
	});

	it('expands ligatures and keeps offsets on the original characters', () => {
		const text = 'the ﬁnal ofﬁce';
		expect(fold(text).text).toBe('the final office');
		expect(hits(text, 'final')).toEqual(['ﬁnal']);
		// A match ending inside a ligature takes the ligature whole.
		expect(hits(text, 'off')).toEqual(['ofﬁ']);
		expect(hits(text, 'office')).toEqual(['ofﬁce']);
	});

	it('treats runs of spaces, tabs and no-break spaces as one space', () => {
		expect(foldQuery('  total \t  due ')).toBe('total due');
		expect(hits('Total due:  1,250.00', 'total due')).toEqual(['Total due']);
		expect(hits('Total   due', 'total due')).toEqual(['Total   due']);
	});

	it('matches typographic look-alikes', () => {
		expect(hits('Don’t pay “late” fees — ever', "don't pay \"late\" fees - ever")).toEqual(['Don’t pay “late” fees — ever']);
		expect(hits('co­operate', 'cooperate')).toEqual(['co­operate']);
	});

	it('finds every non-overlapping match, left to right', () => {
		expect(hits('aaaa', 'aa')).toEqual(['aa', 'aa']);
		expect(hits('Invoice INVOICE invoice', 'invoice')).toHaveLength(3);
		expect(hits('nothing here', '')).toEqual([]);
		expect(hits('nothing here', '   ')).toEqual([]);
	});
});

describe('matchPages', () => {
	const doc = [
		[{ text: 'The amount below is the Amount total' }, { text: 'due next month for the account.' }],
		null,
		[{ text: 'Total due: 1,250.00' }, { text: 'total' }]
	];

	it('lists matches in page then reading order, never across lines', () => {
		const r = matchPages(doc, foldQuery('total'));
		expect(r.hits.map((h) => [h.page, h.line, h.start])).toEqual([
			[0, 0, 31],
			[2, 0, 0],
			[2, 1, 0]
		]);
		// "total" ends one line and "due" starts the next: no phrase match there.
		expect(matchPages(doc, foldQuery('total due')).hits.map((h) => h.page)).toEqual([2]);
		expect(r.truncated).toBe(false);
	});

	it('stops at the cap and says so', () => {
		const r = matchPages(doc, foldQuery('t'), 3);
		expect(r.hits).toHaveLength(3);
		expect(r.truncated).toBe(true);
	});
});
