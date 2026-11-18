/**
 * The invisible text layer's lines (find/TextLayer.svelte) and the Find bar's search
 * strings: one string per line of the page as shown, its words joined by single
 * spaces, so a phrase within a line ("total due") matches across its words while two
 * lines never run together. Pure; no DOM.
 *
 * Geometry is in stamp space (core/types.ts StampBox: fractions of the page as shown,
 * after PageRef.rotation and crop, origin top-left), from editor/text-select.ts
 * `shownLayout`. Words under a redaction box are left out (the export removes them, so
 * Find must not point at them), and a line is cut where such a word was, so a phrase
 * never jumps over a redaction.
 */

import { reframeBox } from '../doc/crop';
import type { PageRef, PageText, Rotation, StampBox } from '../core/types';
import { shownLayout, type TextLayout } from '../editor/text-select';

/** Writing direction on the shown page, clockwise degrees from left-to-right. */
export type Angle = 0 | 90 | 180 | 270;

export interface LayerLine {
	/** The words joined by single spaces: the text node's content and what Find searches. */
	text: string;
	/** The line's box (stamp space). */
	box: StampBox;
	angle: Angle;
	/** Offset in `text` where each word starts, and each word's box. */
	starts: number[];
	words: StampBox[];
}

function union(a: StampBox, b: StampBox): StampBox {
	const x0 = Math.min(a.x, b.x);
	const y0 = Math.min(a.y, b.y);
	const x1 = Math.max(a.x + a.w, b.x + b.w);
	const y1 = Math.max(a.y + a.h, b.y + b.h);
	return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

function centerIn(b: StampBox, r: StampBox): boolean {
	const cx = b.x + b.w / 2;
	const cy = b.y + b.h / 2;
	return cx >= r.x && cx <= r.x + r.w && cy >= r.y && cy <= r.y + r.h;
}

/**
 * Which way a line is written on the shown page. The file's own lines are taken as
 * written left to right (nearly all are); a turned page turns them. A line running up
 * or down an unturned page (a label written sideways) is taken as turned a quarter
 * clockwise. The writing direction only matters for how the invisible glyphs are laid
 * out under the line's box; matching does not depend on it.
 */
export function lineAngle(across: boolean, rotation: Rotation): Angle {
	const sideways = rotation === 90 || rotation === 270;
	if (across) return sideways ? 0 : (rotation as Angle);
	return sideways ? (rotation as Angle) : 90;
}

/** Lines of a laid-out page. `hidden`: boxes (same frame) whose words are left out. */
export function layerLines(layout: TextLayout, rotation: Rotation, hidden: readonly StampBox[] = []): LayerLine[] {
	const out: LayerLine[] = [];
	for (const l of layout.lines) {
		const angle = lineAngle(l.across, rotation);
		let cur: LayerLine | null = null;
		for (let i = l.first; i <= l.last; i++) {
			const w = layout.words[i];
			const text = w.text.replace(/\s+/g, ' ').trim();
			if (!text) continue;
			if (!(w.box.w > 0 && w.box.h > 0) || hidden.some((r) => centerIn(w.box, r))) {
				// Under a redaction (or no size): the line is cut here.
				cur = null;
				continue;
			}
			if (!cur) {
				cur = { text: '', box: { ...w.box }, angle, starts: [], words: [] };
				out.push(cur);
			} else {
				cur.text += ' ';
				cur.box = union(cur.box, w.box);
			}
			cur.starts.push(cur.text.length);
			cur.words.push(w.box);
			cur.text += text;
		}
	}
	return out;
}

/**
 * A page's lines as a PageRef shows them. `wholePage`: the editor's crop tool shows
 * the whole page while a crop is being changed, so the words are not cut to the crop.
 */
export function pageLines(text: PageText, page: Pick<PageRef, 'rotation' | 'crop' | 'stamps'>, aspect: number, wholePage = false): LayerLine[] {
	if (!text.words.length) return [];
	const crop = wholePage ? undefined : page.crop;
	const layout = shownLayout(text, page.rotation, aspect, crop);
	const hidden = page.stamps.flatMap((s) => (s.kind === 'redact' ? [wholePage && page.crop ? reframeBox(s.box, page.crop, undefined) : s.box] : []));
	return layerLines(layout, page.rotation, hidden);
}

/** Box of the characters start..end of a line (approximate within a word: shares of its width). */
export function rangeBox(line: LayerLine, start: number, end: number): StampBox | null {
	let box: StampBox | null = null;
	for (let k = 0; k < line.starts.length; k++) {
		const ws = line.starts[k];
		const we = ws + (k + 1 < line.starts.length ? line.starts[k + 1] - 1 - ws : line.text.length - ws);
		const s = Math.max(start, ws);
		const e = Math.min(end, we);
		if (e <= s) continue;
		const len = Math.max(1, we - ws);
		const b = line.words[k];
		const a0 = (s - ws) / len;
		const a1 = (e - ws) / len;
		let part: StampBox;
		// Shares along the writing direction.
		if (line.angle === 0) part = { x: b.x + a0 * b.w, y: b.y, w: (a1 - a0) * b.w, h: b.h };
		else if (line.angle === 180) part = { x: b.x + (1 - a1) * b.w, y: b.y, w: (a1 - a0) * b.w, h: b.h };
		else if (line.angle === 90) part = { x: b.x, y: b.y + a0 * b.h, w: b.w, h: (a1 - a0) * b.h };
		else part = { x: b.x, y: b.y + (1 - a1) * b.h, w: b.w, h: (a1 - a0) * b.h };
		box = box ? union(box, part) : part;
	}
	return box;
}
