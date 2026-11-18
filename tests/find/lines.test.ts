/** The text layer's lines (find/lines.ts): one string per line, boxes as shown, redactions, turned pages. */
import { describe, expect, it } from 'vitest';
import type { PageText, Stamp, StampBox } from '../../src/lib/core/types';
import { lineAngle, pageLines, rangeBox } from '../../src/lib/find/lines';

/** Words on lines: each line a row 0.02 high starting at y, words 0.1 wide with 0.02 gaps from x = 0.1. */
function page(...rows: { y: number; words: string[] }[]): PageText {
	return {
		skipped: 0,
		words: rows.flatMap((r, line) => r.words.map((text, i) => ({ text, line, box: { x: 0.1 + i * 0.12, y: r.y, w: 0.1, h: 0.02 } })))
	};
}

const near = (a: StampBox, b: StampBox) => {
	for (const k of ['x', 'y', 'w', 'h'] as const) expect(a[k]).toBeCloseTo(b[k], 6);
};

const ref = (stamps: Stamp[] = [], rotation: 0 | 90 | 180 | 270 = 0, crop?: StampBox) => ({ rotation, stamps, crop });

describe('pageLines', () => {
	const text = page({ y: 0.1, words: ['The', 'Amount', 'total'] }, { y: 0.13, words: ['due', 'next', 'month'] });

	it('joins a line’s words with single spaces, one entry per line', () => {
		const lines = pageLines(text, ref(), 0.77);
		expect(lines.map((l) => l.text)).toEqual(['The Amount total', 'due next month']);
		expect(lines[0].starts).toEqual([0, 4, 11]);
		near(lines[0].box, { x: 0.1, y: 0.1, w: 0.34, h: 0.02 });
		expect(lines.every((l) => l.angle === 0)).toBe(true);
	});

	it('collapses spaces inside a word and drops empty words', () => {
		const t: PageText = {
			skipped: 0,
			words: [
				{ text: ' a  b ', line: 0, box: { x: 0.1, y: 0.1, w: 0.1, h: 0.02 } },
				{ text: '  ', line: 0, box: { x: 0.25, y: 0.1, w: 0.1, h: 0.02 } },
				{ text: 'c', line: 0, box: { x: 0.4, y: 0.1, w: 0.1, h: 0.02 } }
			]
		};
		expect(pageLines(t, ref(), 1).map((l) => l.text)).toEqual(['a b c']);
	});

	it('leaves out words under a redaction and cuts the line there', () => {
		// "Amount" (x 0.22..0.32) is under the box.
		const redact: Stamp = { id: 'r', kind: 'redact', box: { x: 0.2, y: 0.09, w: 0.13, h: 0.04 } };
		const lines = pageLines(text, ref([redact]), 0.77);
		expect(lines.map((l) => l.text)).toEqual(['The', 'total', 'due next month']);
	});

	it('turns lines with the page', () => {
		const lines = pageLines(text, ref([], 90), 1.29);
		expect(lines.map((l) => l.angle)).toEqual([90, 90]);
		// Turned a quarter clockwise: the first line is now near the right edge, running down.
		expect(lines[0].box.x).toBeGreaterThan(0.8);
		expect(lines[0].box.h).toBeGreaterThan(lines[0].box.w);
		expect(pageLines(text, ref([], 180), 0.77).map((l) => l.angle)).toEqual([180, 180]);
	});

	it('keeps only words wholly inside a crop, in the crop’s frame', () => {
		const lines = pageLines(text, ref([], 0, { x: 0, y: 0, w: 0.4, h: 0.5 }), 0.62);
		expect(lines.map((l) => l.text)).toEqual(['The Amount', 'due next']);
		near(lines[0].box, { x: 0.25, y: 0.2, w: 0.55, h: 0.04 });
		// The editor's crop tool shows the whole page.
		expect(pageLines(text, ref([], 0, { x: 0, y: 0, w: 0.4, h: 0.5 }), 0.77, true).map((l) => l.text)).toEqual(['The Amount total', 'due next month']);
	});

	it('maps a redaction from the crop frame to the whole page for the crop tool', () => {
		const crop = { x: 0, y: 0, w: 0.5, h: 0.5 };
		// In the crop's frame "Amount" is at x 0.44..0.64.
		const redact: Stamp = { id: 'r', kind: 'redact', box: { x: 0.42, y: 0.18, w: 0.24, h: 0.08 } };
		expect(pageLines(text, ref([redact], 0, crop), 0.77, true).map((l) => l.text)).toEqual(['The', 'total', 'due next month']);
	});
});

describe('lineAngle', () => {
	it('follows the page turn for lines across, and a quarter turn for sideways labels', () => {
		expect(lineAngle(true, 0)).toBe(0);
		expect(lineAngle(true, 180)).toBe(180);
		expect(lineAngle(false, 90)).toBe(90);
		expect(lineAngle(false, 270)).toBe(270);
		expect(lineAngle(false, 0)).toBe(90);
		expect(lineAngle(true, 90)).toBe(0);
	});
});

describe('rangeBox', () => {
	const [line] = pageLines(page({ y: 0.1, words: ['Total', 'due:', '1,250.00'] }), ref(), 1);

	it('covers whole words of a match', () => {
		near(rangeBox(line, 0, 10)!, { x: 0.1, y: 0.1, w: 0.22, h: 0.02 });
	});

	it('takes a share of a word for part of it', () => {
		// "tal" of "Total": characters 2..5 of 5.
		near(rangeBox(line, 2, 5)!, { x: 0.14, y: 0.1, w: 0.06, h: 0.02 });
	});

	it('is null for an empty range', () => {
		expect(rangeBox(line, 5, 6)).toBeNull();
	});

	it('runs down a line turned a quarter', () => {
		const [down] = pageLines(page({ y: 0.1, words: ['Total'] }), ref([], 90), 1);
		const b = rangeBox(down, 0, 2)!;
		expect(b.h).toBeCloseTo(down.box.h * 0.4, 6);
		expect(b.y).toBeCloseTo(down.box.y, 6);
	});
});
