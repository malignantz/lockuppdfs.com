/**
 * Layout-stability probes for the export dialog: remember where things are, operate a
 * control, and say what moved. Used by workspace-export-stable.spec.ts.
 */
import type { Locator, Page } from '@playwright/test';

export interface Shift {
	/** Largest movement or resize of the dialog panel, its header and its footer (px). */
	frame: number;
	frameWhat: string;
	/** Movement of the operated control's top-left corner (px); null when it was removed. */
	control: number | null;
	/** Largest movement of anything that was above the control (px). */
	above: number;
	aboveWhat: string;
	/** The body's scroll position changed by this much (px). */
	scroll: number;
}

/** Waits for two frames and for running animations (switch thumbs, chevrons, the sheet) to end. */
export async function settle(page: Page): Promise<void> {
	await page.evaluate(
		() =>
			new Promise<void>((done) =>
				requestAnimationFrame(() =>
					requestAnimationFrame(async () => {
						await Promise.all(
							document
								.getAnimations()
								.filter((a) => a.playState === 'running' && a.effect?.getTiming().iterations !== Infinity)
								.map((a) => a.finished.catch(() => undefined))
						);
						done();
					})
				)
			)
	);
}

/**
 * Remembers the dialog's frame, the control and everything above it (inside the dialog
 * body). With `control` null, every element in the body counts as "above".
 */
export async function mark(dialog: Locator, control: Locator | null): Promise<void> {
	if (control) await control.scrollIntoViewIfNeeded();
	await settle(dialog.page());
	const target = control ? await control.elementHandle() : await dialog.elementHandle();
	await target!.evaluate(
		(el, whole) => {
			const d = (el.closest('dialog') ?? el) as HTMLElement;
			const box = (e: Element) => {
				const b = e.getBoundingClientRect();
				return { x: b.x, y: b.y, w: b.width, h: b.height };
			};
			const parts: Record<string, Element | null> = {
				panel: d.querySelector('.panel'),
				head: d.querySelector('.head'),
				foot: d.querySelector('.actions'),
				export: d.querySelector('.actions .btn:last-child')
			};
			const top = whole ? Infinity : el.getBoundingClientRect().top + 0.5;
			const body = d.querySelector('.body')!;
			const els = [...body.querySelectorAll('*')].filter((e) => {
				const b = e.getBoundingClientRect();
				return b.height > 0 && b.bottom <= top && !e.closest('svg');
			});
			(window as unknown as { __mark: unknown }).__mark = {
				el,
				body,
				scroll: body.scrollTop,
				parts,
				before: Object.fromEntries(Object.entries(parts).map(([k, e]) => [k, e ? box(e) : null])),
				ctrl: whole ? null : box(el),
				els,
				elBoxes: els.map(box)
			};
		},
		control === null
	);
}

/** What moved since mark(). */
export async function shift(page: Page): Promise<Shift> {
	await settle(page);
	return page.evaluate(() => {
		type B = { x: number; y: number; w: number; h: number };
		const m = (window as unknown as { __mark: any }).__mark as {
			el: Element;
			body: Element;
			scroll: number;
			parts: Record<string, Element | null>;
			before: Record<string, B | null>;
			ctrl: B | null;
			els: Element[];
			elBoxes: B[];
		};
		const box = (e: Element): B => {
			const b = e.getBoundingClientRect();
			return { x: b.x, y: b.y, w: b.width, h: b.height };
		};
		const name = (e: Element) =>
			`${e.tagName.toLowerCase()}.${[...e.classList].filter((c) => !c.startsWith('s-')).join('.')} "${(e.textContent ?? '').trim().slice(0, 40)}"`;
		let frame = 0;
		let frameWhat = '';
		for (const [k, e] of Object.entries(m.parts)) {
			const a = m.before[k];
			if (!a || !e || !e.isConnected) continue;
			const b = box(e);
			const d = Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y), Math.abs(a.w - b.w), Math.abs(a.h - b.h));
			if (d > frame) {
				frame = d;
				frameWhat = `${k} ${JSON.stringify(a)} -> ${JSON.stringify(b)}`;
			}
		}
		let control: number | null = null;
		if (m.ctrl && m.el.isConnected) {
			const b = box(m.el);
			control = Math.max(Math.abs(b.x - m.ctrl.x), Math.abs(b.y - m.ctrl.y));
		}
		let above = 0;
		let aboveWhat = '';
		m.els.forEach((e, i) => {
			if (!e.isConnected) return;
			const a = m.elBoxes[i];
			const b = box(e);
			const d = Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
			if (d > above) {
				above = d;
				aboveWhat = `${name(e)} y ${a.y.toFixed(1)} -> ${b.y.toFixed(1)}, x ${a.x.toFixed(1)} -> ${b.x.toFixed(1)}`;
			}
		});
		return { frame, frameWhat, control, above, aboveWhat, scroll: Math.abs(m.body.scrollTop - m.scroll) };
	});
}
