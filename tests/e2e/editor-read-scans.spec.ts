/**
 * Scans without text are read in the background on a desktop (editor/scan-reader.svelte.ts),
 * so their words can be selected, copied and highlighted in the editor without exporting.
 * Corpus: tests/corpus/generate-ocr.mjs (432 × 288 pt pages; p1 and p8 readable letters,
 * p2 sideways, p3 made-up words, p4–p7 not tried). The fixture blocks other origins.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as mupdf from 'mupdf';
import type { Page } from '@playwright/test';
import { test, expect } from './fixtures';
import { chooseTool, pageBox } from './editor-helpers';
import { openMore } from './export-helpers';

const corpus = (name: string) => fileURLToPath(new URL(`../corpus/files/${name}`, import.meta.url));
const manifest = JSON.parse(readFileSync(corpus('manifest.json'), 'utf8'))['ocr-scans.pdf'] as { words: { t: string; box: [number, number, number, number] }[] };
const W = 432;
const H = 288;
const NOTICE = 'Text in this scan can now be selected.';

/** Centre of a word of the letter (page fractions, as page 1 shows it). */
function at(text: string, nth = 0): [number, number] {
	const w = manifest.words.filter((x) => x.t === text)[nth];
	return [(w.box[0] + w.box[2]) / 2 / W, (w.box[1] + w.box[3]) / 2 / H];
}

async function drag(page: Page, from: [number, number], to: [number, number]) {
	const b = await pageBox(page);
	await page.mouse.move(b.x + from[0] * b.width, b.y + from[1] * b.height);
	await page.mouse.down();
	for (let i = 1; i <= 10; i++) await page.mouse.move(b.x + (from[0] + ((to[0] - from[0]) * i) / 10) * b.width, b.y + (from[1] + ((to[1] - from[1]) * i) / 10) * b.height);
	await page.mouse.up();
}

const selectTool = (page: Page) => page.getByRole('toolbar', { name: 'Tools' }).locator('[data-tool="select"]');
const textBar = (page: Page) => page.getByRole('toolbar', { name: 'Selected text' });

async function addScan(page: Page) {
	await page.goto('/');
	await page.locator('input[type=file]').first().setInputFiles([corpus('ocr-scans.pdf')]);
	await expect(page.getByRole('option')).toHaveCount(8, { timeout: 30_000 });
}

test.describe('desktop', () => {
	test.beforeEach(({ context, baseURL }, info) => {
		test.skip(info.project.name !== 'desktop-chrome', 'desktop only');
		return context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: new URL(baseURL!).origin });
	});

	test('a scan is read once added: the notice, then Select text, Copy and a highlight that survives export, reused by the export', async ({ page }) => {
		test.setTimeout(180_000);
		const logs: string[] = [];
		page.on('console', (m) => logs.push(m.text()));
		await addScan(page);
		// On the grid: the quiet notice once the scan has been read (polite live region).
		const notice = page.getByRole('region', { name: 'Notifications' }).getByText(NOTICE);
		await expect(notice).toBeVisible({ timeout: 90_000 });
		await expect(page.getByRole('region', { name: 'Notifications' }).locator('[aria-live="polite"]')).toContainText(NOTICE);

		await page.getByRole('option').nth(0).dblclick();
		await expect(page.getByRole('dialog', { name: /^Edit page 1 of 8/ })).toBeVisible();
		// Read already: Select text is the tool (mouse), no reading note.
		await expect(selectTool(page)).toHaveAttribute('aria-pressed', 'true');
		await expect(page.getByTestId('scan-chip')).toHaveCount(0);
		await drag(page, at('Dear'), at('May.'));
		await expect(textBar(page)).toBeVisible();
		await expect(textBar(page).getByText('12 words')).toBeVisible();
		await expect(textBar(page).getByText('Read from a scan. Check it.')).toBeVisible();
		await page.evaluate(() => navigator.clipboard.writeText(''));
		await textBar(page).getByRole('button', { name: 'Copy' }).click();
		await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe('Dear Sir, thank you for your letter of the first of May.');
		// Ctrl+A takes the whole letter.
		await page.keyboard.press('Control+a');
		await page.keyboard.press('Control+c');
		await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toMatch(/^Dear Sir,[\s\S]*Yours truly, John Smith$/);

		// Highlight > Text on the read words.
		await chooseTool(page, 'Highlight');
		const bar = page.getByRole('toolbar', { name: 'Highlighter' });
		await expect(bar.locator('[data-mode="text"]')).toHaveAttribute('aria-checked', 'true');
		await drag(page, at('house'), at('hill'));
		await expect(page.getByTestId('live')).toHaveText(/Highlighted 4 words, yellow\./);
		await page.keyboard.press('Escape');
		await page.getByRole('button', { name: 'Done', exact: true }).click();

		// Export with "Make scanned pages searchable": the pages read in the editor are not read again.
		await page.getByRole('button', { name: 'Export', exact: true }).click();
		const dialog = page.getByRole('dialog', { name: 'Export PDF' });
		await openMore(dialog);
		await dialog.getByRole('switch', { name: 'Make scanned pages searchable' }).click();
		await dialog.getByRole('button', { name: 'Export', exact: true }).click();
		const done = page.getByRole('dialog', { name: 'Your file is ready' });
		await expect(done.getByText('Checked: 8 pages, opens cleanly.')).toBeVisible({ timeout: 120_000 });
		await expect(done.getByText('2 pages made searchable. 2 pages were left as they were because the text could not be read well enough.')).toBeVisible();
		expect(logs.filter((l) => /read before \(in the editor\); not read again/.test(l)).length).toBe(4);
		expect(logs.some((l) => /ocr: page \d+ (accepted|declined)/.test(l))).toBe(false);
		const [download] = await Promise.all([page.waitForEvent('download'), done.getByRole('button', { name: 'Download' }).click()]);
		const out = new Uint8Array(readFileSync((await download.path())!));

		// The highlight is on the words in the exported page: yellow under "house" … "hill", none elsewhere on the line.
		const doc = new mupdf.PDFDocument(out);
		try {
			const pix = doc.loadPage(0).toPixmap(mupdf.Matrix.scale(2, 2), mupdf.ColorSpace.DeviceRGB, false, true);
			const px = pix.getPixels();
			const pw = pix.getWidth();
			const yellow = (fx: number, fy: number) => {
				let n = 0;
				const cx = Math.round(fx * W * 2);
				const cy = Math.round(fy * H * 2);
				for (let dy = -6; dy <= 6; dy++)
					for (let dx = -12; dx <= 12; dx++) {
						const i = ((cy + dy) * pw + cx + dx) * 3;
						if (px[i] > 180 && px[i + 1] > 160 && px[i + 2] < 120) n++;
					}
				return n;
			};
			expect(yellow(...at('house'))).toBeGreaterThan(20);
			expect(yellow(...at('hill'))).toBeGreaterThan(20);
			expect(yellow(...at('looked'))).toBe(0);
			pix.destroy();
		} finally {
			doc.destroy();
		}
	});

	test('a text tool chosen on a page still being read says so in its bar, then works', async ({ page }) => {
		test.setTimeout(120_000);
		await addScan(page);
		// Page 8 at once: it goes to the front of the queue.
		await page.getByRole('option').nth(7).dblclick();
		await expect(page.getByRole('dialog', { name: /^Edit page 8 of 8/ })).toBeVisible();
		await selectTool(page).click();
		const wait = page.getByTestId('scan-wait-bar');
		await expect(wait.getByText('Reading the text on this page…')).toBeVisible();
		await expect(selectTool(page)).toHaveAttribute('aria-pressed', 'true');
		await expect(wait).toHaveCount(0, { timeout: 60_000 });
		await expect(selectTool(page)).toHaveAttribute('aria-pressed', 'true');
		// Page 8 shows the letter upright (its picture is stored turned on a /Rotate 270 page).
		await drag(page, at('Yours'), at('Smith'));
		await expect(textBar(page).getByText('4 words')).toBeVisible();
		await textBar(page).getByRole('button', { name: 'Copy' }).click();
		await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe('Yours truly, John Smith');
		// A page whose reading finds nothing (sideways): the old wording.
		await page.keyboard.press('Escape');
		await page.getByRole('button', { name: 'Done', exact: true }).click();
		await page.getByRole('option').nth(1).dblclick();
		await chooseTool(page, 'Highlight');
		await expect(page.getByTestId('hl-note')).toHaveText('This page is a scan with no selectable text. Use Pen or Box.', { timeout: 60_000 });
	});

	test('turned in the editor, the read words still line up with the picture', async ({ page }) => {
		test.setTimeout(120_000);
		await addScan(page);
		await expect(page.getByRole('region', { name: 'Notifications' }).getByText(NOTICE)).toBeVisible({ timeout: 90_000 });
		await page.getByRole('option').nth(0).click();
		await page.keyboard.press('r');
		await page.getByRole('option').nth(0).dblclick();
		await expect(selectTool(page)).toHaveAttribute('aria-pressed', 'true');
		// Turned 90° clockwise: a point (x, y) of the upright page shows at (1 - y, x).
		const turn = ([x, y]: [number, number]): [number, number] => [1 - y, x];
		await drag(page, turn(at('Dear')), turn(at('May.')));
		await expect(textBar(page).getByText('12 words')).toBeVisible();
		await textBar(page).getByRole('button', { name: 'Copy' }).click();
		await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe('Dear Sir, thank you for your letter of the first of May.');
		// Zoomed in, the same words.
		await page.keyboard.press('Escape');
		await page.keyboard.press('=');
		await expect(textBar(page)).toHaveCount(0);
		await drag(page, turn(at('house')), turn(at('like')));
		await textBar(page).getByRole('button', { name: 'Copy' }).click();
		await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe('house on the hill and we would like');
	});
});

test('phone: nothing is read, nothing changes', async ({ page }, info) => {
	test.skip(info.project.name !== 'phone', 'phone only');
	test.setTimeout(60_000);
	const ocrFiles: string[] = [];
	page.context().on('request', (r) => {
		if (/tesseract-core|traineddata|\/worker\.min-/.test(r.url())) ocrFiles.push(r.url());
	});
	await addScan(page);
	await page.getByRole('option').nth(0).click();
	await page.waitForTimeout(6000);
	await expect(page.getByText(NOTICE)).toHaveCount(0);
	expect(ocrFiles).toEqual([]);
});
