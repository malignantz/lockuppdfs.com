/**
 * The export form does not jump. Operating a control never moves that control, nothing
 * above it moves, and the dialog's frame (top edge, header, width, footer with the
 * Export button) neither moves nor resizes; new content only appears below and scrolls.
 * Rows that depend on what the pages hold (searchable scans, oversized pictures) are
 * decided before the form shows, so nothing shifts in the first moments either.
 * Desktop (also a short 1366 x 768 window) and phone.
 */
import { fileURLToPath } from 'node:url';
import type { Locator, Page } from '@playwright/test';
import { test, expect } from './fixtures';
import { mark, shift } from './stable-helpers';

const corpus = (name: string) => fileURLToPath(new URL(`../corpus/files/${name}`, import.meta.url));

/** A control to operate: [what, find it, how (default: click)]. */
type Step = [string, (d: Locator) => Locator, ((l: Locator) => Promise<unknown>)?];
const sw = (name: string) => (d: Locator) => d.getByRole('switch', { name, exact: true });
const radio = (name: string) => (d: Locator) => d.getByRole('radio', { name, exact: true });
const field = (name: string) => (d: Locator) => d.getByLabel(name, { exact: true });
const more = (d: Locator) => d.getByRole('button', { name: /^More options/ });
const type = (v: string) => async (l: Locator) => {
	await l.fill(v);
	await l.blur();
};
const choose = (label: string) => (l: Locator) => l.selectOption({ label });

async function openExport(page: Page, files: string[], pages: number): Promise<Locator> {
	await page.goto('/');
	await page.locator('input[type=file]').first().setInputFiles(files.map(corpus));
	await expect(page.getByRole('option')).toHaveCount(pages, { timeout: 30_000 });
	await page.getByRole('button', { name: 'Export', exact: true }).click();
	const dialog = page.getByRole('dialog', { name: /^Export/ });
	await expect(dialog).toBeVisible();
	await expect(dialog.locator('form.waiting')).toHaveCount(0, { timeout: 10_000 });
	return dialog;
}

/** Operates each control and checks that nothing it should not move moved, at once and a moment later. */
async function operate(page: Page, dialog: Locator, steps: Step[]) {
	for (const [what, find, act] of steps) {
		const control = find(dialog);
		await expect(control, what).toBeVisible();
		await mark(dialog, control);
		await (act ? act(control) : control.click());
		for (const when of ['at once', 'a moment later']) {
			if (when !== 'at once') await page.waitForTimeout(400);
			const s = await shift(page);
			const where = `${what}, ${when}`;
			expect(s.frame, `${where}: the dialog frame moved (${s.frameWhat})`).toBeLessThanOrEqual(1);
			expect(s.control, `${where}: the control moved`).not.toBeNull();
			expect(s.control!, `${where}: the control moved`).toBeLessThanOrEqual(1);
			expect(s.above, `${where}: something above moved (${s.aboveWhat})`).toBeLessThanOrEqual(1);
		}
	}
}

/** Nothing in the dialog moves during the first 1.5 s after the form shows. */
async function stillAfterOpening(page: Page, dialog: Locator) {
	await mark(dialog, null);
	await page.waitForTimeout(1500);
	const s = await shift(page);
	expect(s.frame, `the dialog frame moved (${s.frameWhat})`).toBeLessThanOrEqual(1);
	expect(s.above, `something moved after opening (${s.aboveWhat})`).toBeLessThanOrEqual(1);
}

const plainSteps: Step[] = [
	['Save as JPG', radio('JPG pictures')],
	['Quality', radio('Print (300 dpi)')],
	['Save as PNG', radio('PNG pictures')],
	['Save as PDF', radio('PDF')],
	['Optimize off', sw('Optimize')],
	['Optimize on', sw('Optimize')],
	['Add a password', sw('Add a password')],
	['Password left empty', field('Password'), type('')],
	['Password', field('Password'), type('one')],
	['Confirm, not matching', field('Confirm password'), type('two')],
	['Show passwords', field('Show passwords')],
	['Password off', sw('Add a password')],
	['More options open', more],
	['Split', sw('Split into several files')],
	['How to split', field('How to split'), choose('Every N pages')],
	['Pages per file, invalid', field('Pages per file'), type('0')],
	['Split off', sw('Split into several files')],
	['Fit under a size', sw('Fit under a size')],
	['Other size', radio('Other')],
	['Size in MB, invalid', field('Size in MB'), type('abc')],
	['Fit off', sw('Fit under a size')],
	['Number the pages', sw('Number the pages')],
	['Style', field('Style'), choose('Bates number')],
	['Digits, invalid', field('Digits'), type('2')],
	['Digits', field('Digits'), type('4')],
	['Position', (d) => d.getByRole('radio', { name: 'Top right' })],
	['Size of numbers', (d) => d.getByRole('radiogroup', { name: 'Size' }).getByRole('radio').last()],
	['Numbers off', sw('Number the pages')],
	['Add a watermark', sw('Add a watermark')],
	['Watermark text', (d) => d.getByRole('radiogroup', { name: 'Text' }).getByRole('radio').last()],
	['Watermark look', (d) => d.getByRole('radiogroup', { name: 'Look' }).getByRole('radio').last()],
	['Watermark strength', (d) => d.getByRole('radiogroup', { name: 'Strength' }).getByRole('radio').last()],
	['Watermark colour', (d) => d.getByRole('radiogroup', { name: 'Colour' }).getByRole('radio').last()],
	['Watermark off', sw('Add a watermark')],
	['Remove metadata', sw('Remove metadata')],
	['Number the pages again', sw('Number the pages')],
	['More options folded', more],
	['More options open again', more]
];

for (const short of [false, true]) {
	test.describe(short ? 'short window' : 'default window', () => {
		if (short) test.use({ viewport: { width: 1366, height: 768 } });

		test('every control of the form stays put, and so does the frame', async ({ page }, info) => {
			test.skip(short && info.project.name === 'phone', 'desktop window size');
			test.setTimeout(120_000);
			const dialog = await openExport(page, ['multi.pdf'], 6);
			await stillAfterOpening(page, dialog);
			await operate(page, dialog, plainSteps);
		});
	});
}

test('several files: split by file', async ({ page }) => {
	test.setTimeout(60_000);
	const dialog = await openExport(page, ['multi.pdf', 'sizes.pdf'], 12);
	await stillAfterOpening(page, dialog);
	await operate(page, dialog, [
		['More options open', more],
		['Split', sw('Split into several files')],
		['How to split', field('How to split'), choose('One file per original file')],
		['Split off', sw('Split into several files')]
	]);
});

test('oversized pictures: the row is there from the start; Optimize and Reduce stay put', async ({ page }) => {
	test.setTimeout(60_000);
	const dialog = await openExport(page, ['print-cap.pdf'], 3);
	await expect(dialog.getByRole('switch', { name: 'Reduce oversized pictures' })).toBeVisible();
	await stillAfterOpening(page, dialog);
	await operate(page, dialog, [
		['Reduce off', sw('Reduce oversized pictures')],
		['Reduce on', sw('Reduce oversized pictures')],
		['Optimize off', sw('Optimize')],
		['Optimize on', sw('Optimize')],
		['More options open', more],
		['Fit under a size', sw('Fit under a size')],
		['Fit off', sw('Fit under a size')]
	]);
});

test('scanned pages: the searchable row is there from the start (desktop)', async ({ page }, info) => {
	test.skip(info.project.name === 'phone', 'desktop only option');
	test.setTimeout(60_000);
	const dialog = await openExport(page, ['ocr-scans.pdf'], 8);
	await stillAfterOpening(page, dialog);
	await operate(page, dialog, [
		['More options open', more],
		['Searchable', sw('Make scanned pages searchable')],
		['Searchable off', sw('Make scanned pages searchable')]
	]);
});

test('black and white scans: the row is there from the start; the switch stays put while its preview is made', async ({ page }) => {
	test.setTimeout(90_000);
	const dialog = await openExport(page, ['bilevel-scans.pdf'], 6);
	await stillAfterOpening(page, dialog);
	await operate(page, dialog, [['More options open', more]]);
	const option = dialog.getByRole('switch', { name: 'Make scanned pages black and white' });
	await mark(dialog, option);
	await option.click();
	// The preview takes a moment; the switch, everything above and the frame stay put when it lands.
	await expect(dialog.getByRole('img', { name: 'The same part in black and white, like a photocopy' })).toBeVisible({ timeout: 30_000 });
	const s = await shift(page);
	expect(s.frame, `the dialog frame moved (${s.frameWhat})`).toBeLessThanOrEqual(1);
	expect(s.control!, 'the switch moved').toBeLessThanOrEqual(1);
	expect(s.above, `something above moved (${s.aboveWhat})`).toBeLessThanOrEqual(1);
	await operate(page, dialog, [
		['Black and white off', sw('Make scanned pages black and white')],
		['Black and white on again', sw('Make scanned pages black and white')]
	]);
});
