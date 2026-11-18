/**
 * Mark for blackout (find/blackout.ts): where the boxes go for every match, on turned,
 * cropped and repeated pages; what search could not see; the confirm's words.
 */
import { describe, expect, it } from 'vitest';
import type { PageRef, PageText, Rotation, Source, Stamp, StampBox } from '../../src/lib/core/types';
import { pageLines } from '../../src/lib/find/lines';
import { confirmTitle, markedToast, planBlackout, unseenLines, wordsBox, type PagePlanInput } from '../../src/lib/find/blackout';
import { foldQuery } from '../../src/lib/find/match';

/** Words on lines: each line a row 0.02 high at y, words 0.1 wide with 0.02 gaps from x = 0.1. */
function text(...rows: { y: number; words: string[] }[]): PageText {
	return {
		skipped: 0,
		words: rows.flatMap((r, line) => r.words.map((t, i) => ({ text: t, line, box: { x: 0.1 + i * 0.12, y: r.y, w: 0.1, h: 0.02 } })))
	};
}

const src = (id: string, kind: Source['kind'] = 'pdf'): Source => ({
	id,
	name: `${id}.pdf`,
	kind,
	bytes: new Uint8Array(),
	pages: [{ width: 600, height: 800 }],
	originalSize: 0,
	wasEncrypted: false,
	notes: []
});

let n = 0;
const page = (sourceId: string, rotation: Rotation = 0, crop?: StampBox, stamps: Stamp[] = []): PageRef => ({ id: `p${n++}`, sourceId, pageIndex: 0, rotation, stamps, ...(crop ? { crop } : {}) });

const aspectOf = (rotation: Rotation) => (rotation === 90 || rotation === 270 ? 800 / 600 : 600 / 800);

function input(page: PageRef, source: Source, t: PageText | null): PagePlanInput {
	return { page, source, text: t, lines: t ? pageLines(t, page, aspectOf(page.rotation), true) : null };
}

const near = (a: StampBox, b: StampBox) => {
	for (const k of ['x', 'y', 'w', 'h'] as const) expect(a[k], k).toBeCloseTo(b[k], 6);
};

const doc = text({ y: 0.1, words: ['Dear', 'Jane', 'Doe,'] }, { y: 0.2, words: ['jane', 'doe', 'was', 'here'] }, { y: 0.3, words: ['Mary', 'Jane'] }, { y: 0.4, words: ['Doe'] });
const q = foldQuery('Jane  Doe');

describe('planBlackout: boxes', () => {
	it('boxes the words of each match on an upright page (union of the word boxes, whole words)', () => {
		const s = src('a');
		const p = page('a');
		const plan = planBlackout([input(p, s, doc)], q);
		// Two matches; "Jane" / "Doe" across lines 3 and 4 is not one (that is the check's job).
		expect(plan.boxes).toHaveLength(2);
		expect(plan.pages).toBe(1);
		near(plan.boxes[0].box, { x: 0.22, y: 0.1, w: 0.22, h: 0.02 });
		near(plan.boxes[1].box, { x: 0.1, y: 0.2, w: 0.22, h: 0.02 });
		expect(plan.boxes.every((b) => b.pageId === p.id)).toBe(true);
	});

	it('takes the whole word when a match is part of one', () => {
		const t = text({ y: 0.5, words: ['Mr', 'Doeson'] });
		const plan = planBlackout([input(page('a'), src('a'), t)], foldQuery('doe'));
		expect(plan.boxes).toHaveLength(1);
		near(plan.boxes[0].box, { x: 0.22, y: 0.5, w: 0.1, h: 0.02 });
	});

	it.each([
		[90, { x: 0.88, y: 0.22, w: 0.02, h: 0.22 }],
		[180, { x: 0.56, y: 0.88, w: 0.22, h: 0.02 }],
		[270, { x: 0.1, y: 0.56, w: 0.02, h: 0.22 }]
	] as const)('turns boxes with a page turned %i°', (rotation, want) => {
		const t = text({ y: 0.1, words: ['Dear', 'Jane', 'Doe'] });
		const plan = planBlackout([input(page('a', rotation), src('a'), t)], q);
		expect(plan.boxes).toHaveLength(1);
		near(plan.boxes[0].box, want);
	});

	it('puts boxes in the visible part of a cropped page, and reports matches the crop hides', () => {
		// Visible: x 0.2..0.8, y 0.05..0.35 (as shown). Line 1's match (x 0.22..0.44) is inside;
		// line 2's (x 0.1..0.32) sticks out on the left; line 4 is below the crop.
		const crop = { x: 0.2, y: 0.05, w: 0.6, h: 0.3 };
		const plan = planBlackout([input(page('a', 0, crop), src('a'), doc)], q);
		expect(plan.boxes).toHaveLength(1);
		near(plan.boxes[0].box, { x: (0.22 - 0.2) / 0.6, y: (0.1 - 0.05) / 0.3, w: 0.22 / 0.6, h: 0.02 / 0.3 });
		expect(plan.cropped).toBe(1);
	});

	it('turns then crops (the crop is in the turned frame)', () => {
		const t = text({ y: 0.1, words: ['Dear', 'Jane', 'Doe'] });
		// Turned 90°: the match is at x 0.88..0.90, y 0.22..0.44 of the turned page.
		const crop = { x: 0.5, y: 0, w: 0.5, h: 1 };
		const plan = planBlackout([input(page('a', 90, crop), src('a'), t)], q);
		expect(plan.boxes).toHaveLength(1);
		near(plan.boxes[0].box, { x: (0.88 - 0.5) / 0.5, y: 0.22, w: 0.02 / 0.5, h: 0.22 });
	});

	it('gives every page that shows a source page its own box (duplicated pages)', () => {
		const s = src('a');
		const p1 = page('a');
		const p2 = page('a', 90);
		const plan = planBlackout([input(p1, s, doc), input(p2, s, doc)], q);
		expect(plan.boxes.map((b) => b.pageId)).toEqual([p1.id, p1.id, p2.id, p2.id]);
		expect(plan.pages).toBe(2);
		// The copy's boxes are turned with it.
		near(plan.boxes[2].box, { x: 1 - 0.12, y: 0.22, w: 0.02, h: 0.22 });
	});

	it('skips matches an existing box already covers, and words under a box are not matched at all', () => {
		const s = src('a');
		// A box over line 1's whole match: Find no longer sees those words.
		const covering: Stamp = { id: 'r1', kind: 'redact', box: { x: 0.2, y: 0.09, w: 0.3, h: 0.04 } };
		const plan = planBlackout([input(page('a', 0, undefined, [covering]), s, doc)], q);
		expect(plan.boxes).toHaveLength(1);
		near(plan.boxes[0].box, { x: 0.1, y: 0.2, w: 0.22, h: 0.02 });
	});

	it('the safety net: an exact box already there counts as covered', () => {
		// Lines built without the stamp (as if read before it was placed): the box is still found to cover the match.
		const s = src('a');
		const p = page('a');
		const lines = pageLines(doc, p, aspectOf(0), true);
		const withBox = { ...p, stamps: [{ id: 'r', kind: 'redact', box: { x: 0.22, y: 0.1, w: 0.22, h: 0.02 } } as Stamp] };
		const plan = planBlackout([{ page: withBox, source: s, text: doc, lines }], q);
		expect(plan.covered).toBe(1);
		expect(plan.boxes).toHaveLength(1);
	});

	it('one box for two matches in the same words', () => {
		const t = text({ y: 0.5, words: ['annann'] });
		const plan = planBlackout([input(page('a'), src('a'), t)], foldQuery('ann'));
		expect(plan.boxes).toHaveLength(1);
	});

	it('plans nothing past the match limit', () => {
		const plan = planBlackout([input(page('a'), src('a'), doc)], q, 1);
		expect(plan.tooMany).toBe(true);
		expect(plan.boxes).toEqual([]);
	});
});

describe('planBlackout: what search could not see', () => {
	it('counts pictures, pages without text, pages not read, fields and comments', () => {
		const withAnnots: PageText = { ...doc, annots: { comments: 2, fields: 1 } };
		const plan = planBlackout(
			[
				input(page('img'), src('img', 'image'), null),
				input(page('blank'), src('blank', 'blank'), null),
				input(page('scan'), src('scan'), { words: [], skipped: 0 }),
				input(page('later'), src('later'), null),
				input(page('a'), src('a'), withAnnots),
				// A scan whose words came from the scan reader: the file's own annotations still count.
				{ ...input(page('b'), src('b'), doc), annots: { comments: 0, fields: 3 } }
			],
			q
		);
		expect(plan.unseen).toEqual({ noText: 2, notRead: 1, fields: 2, comments: 1 });
		const lines = unseenLines(plan, false);
		expect(lines).toEqual([
			'2 pages with no readable text (scans or pictures). Look at them yourself.',
			'1 page past what search reads in a long document.',
			'Text in form fields (on 2 pages).',
			'Comments and notes (on 1 page).',
			'A phrase broken across two lines or hyphenated, and words inside pictures.'
		]);
		expect(unseenLines(plan, true)[1]).toBe('1 page not read yet. Wait for reading to finish, then search again.');
	});

	it('says what a crop hides, and always the line-break rule', () => {
		expect(unseenLines({ unseen: { noText: 0, notRead: 0, fields: 0, comments: 0 }, cropped: 2 }, false)).toEqual([
			'2 matches in parts of pages hidden by a crop. They stay in the file, so the export will stop until you remove the crop and black them out.',
			'A phrase broken across two lines or hyphenated, and words inside pictures.'
		]);
	});

	it('words for the title and the toast', () => {
		expect(confirmTitle({ boxes: new Array(12).fill(null), pages: 4 })).toBe('Add 12 blackout boxes on 4 pages?');
		expect(confirmTitle({ boxes: [null as never], pages: 1 })).toBe('Add 1 blackout box on 1 page?');
		expect(markedToast(12)).toBe('12 blackout boxes added. They’re applied when you export.');
	});
});

describe('wordsBox', () => {
	it('is the union of the words the characters touch', () => {
		const [line] = pageLines(text({ y: 0.1, words: ['ab', 'cd', 'ef'] }), page('a'), 0.75, true);
		near(wordsBox(line, 1, 4)!, { x: 0.1, y: 0.1, w: 0.22, h: 0.02 });
		near(wordsBox(line, 3, 5)!, { x: 0.22, y: 0.1, w: 0.1, h: 0.02 });
		expect(wordsBox(line, 2, 3)).toBeNull();
	});
});
