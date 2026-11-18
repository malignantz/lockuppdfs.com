/** The blackout check's text rules (engine/blackout-text.ts): more thorough than Find. */
import { describe, expect, it } from 'vitest';
import { containsTerm, joinLines, termForm, termKey, termsIn, termsInString } from '../../src/lib/engine/blackout-text';

const t = (s: string) => termForm(s)!;
const has = (lines: string[], term: string) => containsTerm(joinLines(lines), t(term));

describe('termForm', () => {
	it('folds case, accents and spacing; empty when nothing to search', () => {
		expect(t('  José   DOE ')).toMatchObject({ spaced: 'jose doe', compact: 'josedoe' });
		expect(t('co-worker').compact).toBe('coworker');
		expect(termForm('   ')).toBeNull();
		expect(termForm('-')).toBeNull();
		expect(termKey('Jane  DOE')).toBe(termKey('jane doe'));
	});
});

describe('containsTerm', () => {
	it('finds what Find finds: within a line, folded', () => {
		expect(has(['Dear JANE   Doe,'], 'jane doe')).toBe(true);
		expect(has(['Ms Jané Doé'], 'Jane Doe')).toBe(true);
		expect(has(['ﬁnal ﬁgures'], 'final')).toBe(true);
		expect(has(['O’Brien'], "O'Brien")).toBe(true);
		expect(has(['planning'], 'ann')).toBe(true);
		expect(has(['nothing here'], 'jane')).toBe(false);
	});

	it('finds a phrase broken across two lines', () => {
		expect(has(['The claim of Jane', 'Doe was denied.'], 'Jane Doe')).toBe(true);
		expect(has(['The claim of Jane  ', '  Doe was denied.'], 'Jane Doe')).toBe(true);
	});

	it('rejoins hyphenated line ends, with and without the hyphen', () => {
		expect(has(['Mrs Jane Do-', 'e signed.'], 'Jane Doe')).toBe(true);
		expect(has(['Mrs Jane Do‐', 'e signed.'], 'Jane Doe')).toBe(true);
		// A soft hyphen, which Find drops.
		expect(has(['Mrs Jane Do­', 'e signed.'], 'Jane Doe')).toBe(true);
		expect(has(['our co-', 'worker said'], 'co-worker')).toBe(true);
		expect(has(['our co-', 'worker said'], 'coworker')).toBe(true);
		// A dash before a number is not a broken word, but spaces-ignored still sees it.
		expect(has(['pages 3-', '4'], '3-4')).toBe(true);
	});

	it('ignores spaces and hyphens where the match starts and ends at word edges', () => {
		expect(has(['J a n e  D o e'], 'Jane Doe')).toBe(true);
		expect(has(['JaneDoe'], 'Jane Doe')).toBe(true);
		expect(has(['Jane-Doe'], 'Jane Doe')).toBe(true);
		expect(has(['(Jane Doe)'], 'JaneDoe')).toBe(true);
		// Not across a word's inside: "Joan Nelson" does not hold "ann".
		expect(has(['Joan Nelson'], 'ann')).toBe(false);
		expect(has(['Bjane doex'], 'jane doe')).toBe(true); // a plain substring, as Find would find it
		expect(has(['Bjane d oex'], 'jane doe')).toBe(false);
	});
});

describe('termsIn / termsInString', () => {
	it('lists the terms found, in order', () => {
		const terms = [t('Jane Doe'), t('123-45-6789'), t('Acme')];
		expect(termsIn(['SSN 123 45', '6789 for Jane', 'Doe'], terms).map((x) => x.term)).toEqual(['Jane Doe', '123-45-6789']);
		expect(termsIn([], terms)).toEqual([]);
	});

	it('splits a string at its line breaks', () => {
		expect(termsInString('Reviewed by Jane\r\nDoe', [t('jane doe')])).toHaveLength(1);
		expect(termsInString('Reviewed by Jane Do-\ne', [t('jane doe')])).toHaveLength(1);
	});
});
