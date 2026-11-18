// Mark for blackout from Find: the bar offers "Mark N for blackout", a confirm says how many
// boxes on how many pages and what search could not see, marking adds ordinary redaction
// boxes, and the export reads its own finished file: a name wrapped across two lines (which
// Find cannot see) stops it with a plain sentence; with that page gone it succeeds and the
// downloaded file no longer holds the name. Corpus: blackout-names.pdf
// (tests/corpus/generate-blackout.mjs). With BLACKOUT_SHOTS=<dir> it also saves screenshots.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as mupdf from 'mupdf';
import type { Page, TestInfo } from '@playwright/test';
import { test, expect } from './fixtures';

const corpus = (name: string) => fileURLToPath(new URL(`../corpus/files/${name}`, import.meta.url));
const isPhone = (info: TestInfo) => info.project.name === 'phone';
const shots = process.env.BLACKOUT_SHOTS;

const findButton = (page: Page) => page.locator('[data-testid^="find-open"]:visible').first();
const bar = (page: Page) => page.getByTestId('find-bar');
const count = (page: Page) => bar(page).getByTestId('find-count');

async function shot(page: Page, info: TestInfo, name: string) {
	if (!shots) return;
	await page.waitForTimeout(300);
	await page.screenshot({ path: `${shots}/${name}-${info.project.name}.png` });
}

/** Every page's text in a PDF, read with MuPDF (lines joined by spaces). */
function textOf(bytes: Uint8Array): string[] {
	const doc = new mupdf.PDFDocument(bytes);
	try {
		return Array.from({ length: doc.countPages() }, (_, i) => doc.loadPage(i).toStructuredText('preserve-whitespace').asText().replace(/\s+/g, ' '));
	} finally {
		doc.destroy();
	}
}

async function startExport(page: Page) {
	await page.getByRole('button', { name: 'Export', exact: true }).first().click();
	const dialog = page.getByRole('dialog', { name: 'Export PDF' });
	await expect(dialog).toBeVisible();
	return dialog;
}

test('mark a name for blackout from Find; a wrapped occurrence stops the export; without it the file has no trace of the name', async ({ page, guard }, info) => {
	test.setTimeout(180_000);
	void guard;
	await page.goto('/');
	await page.locator('input[type=file]').first().setInputFiles(corpus('blackout-names.pdf'));
	await expect(page.getByRole('option')).toHaveCount(4, { timeout: 30_000 });

	await expect(findButton(page)).toBeVisible({ timeout: 30_000 });
	await findButton(page).click();
	await bar(page).getByRole('searchbox', { name: 'Find in document' }).fill('jane doe');
	await expect(count(page)).toHaveText(/^1 of 4( on 3 pages)?$/, { timeout: 30_000 });
	// Reading done: the note under the field has no progress left.
	await expect(bar(page).getByTestId('find-note')).toHaveCount(0, { timeout: 30_000 });
	const markBtn = bar(page).getByRole('button', { name: 'Mark 4 for blackout' });
	await expect(markBtn).toBeVisible();
	await shot(page, info, 'find-bar');

	// Never instant: a confirm first, with what search could not see.
	await markBtn.click();
	const confirm = page.getByRole('dialog', { name: 'Add 4 blackout boxes on 3 pages?' });
	await expect(confirm).toBeVisible();
	await expect(confirm.getByText('A phrase broken across two lines or hyphenated, and words inside pictures.')).toBeVisible();
	await shot(page, info, 'confirm');
	await confirm.getByRole('button', { name: 'Cancel' }).click();
	await expect(confirm).toBeHidden();
	await markBtn.click();
	await page.getByRole('dialog', { name: 'Add 4 blackout boxes on 3 pages?' }).getByRole('button', { name: 'Mark 4' }).click();
	await expect(page.getByText('4 blackout boxes added. They’re applied when you export.')).toBeVisible();
	// The words under the boxes are gone from Find.
	await expect(count(page)).toHaveText('No matches');
	await bar(page).getByRole('button', { name: 'Close find' }).click();

	// Four ordinary redaction boxes; the name is listed for the check.
	let dialog = await startExport(page);
	await expect(dialog.getByText('4 areas will be redacted.', { exact: false })).toBeVisible();
	const terms = dialog.getByTestId('blackout-terms');
	await expect(terms.getByText('jane doe', { exact: true })).toBeVisible();
	await expect(terms.getByRole('button', { name: 'Stop checking for “jane doe”' })).toBeVisible();
	await shot(page, info, 'export-terms');

	// Page 3 wraps the name across two lines: refused, nothing offered.
	await dialog.getByRole('button', { name: 'Export', exact: true }).click();
	const stopped = page.getByRole('dialog', { name: 'Export stopped' });
	await expect(
		stopped.getByText('“jane doe” still appears on page 3 (it may wrap across lines or sit in a scanned picture). Nothing was saved. Black it out on page 3 and export again.')
	).toBeVisible({ timeout: 90_000 });
	await expect(stopped.getByText('Blacked-out words are still in the file.')).toBeVisible();
	await expect(stopped.getByRole('button', { name: 'Download' })).toHaveCount(0);
	await shot(page, info, 'refused');
	await stopped.getByRole('button', { name: 'Close' }).click();

	// Without page 3 the export goes through and says the words are gone.
	if (isPhone(info)) {
		await page.getByRole('toolbar', { name: 'Pages' }).getByRole('button', { name: 'Select' }).tap();
		await page.getByRole('option').nth(2).tap();
		await page.getByRole('toolbar', { name: 'Selected pages' }).getByRole('button', { name: 'Delete' }).tap();
	} else {
		await page.getByRole('option').nth(2).click();
		await page.keyboard.press('Delete');
	}
	await expect(page.getByRole('option')).toHaveCount(3);
	if (isPhone(info)) await page.getByRole('toolbar', { name: 'Selected pages' }).getByRole('button', { name: 'Done' }).tap().catch(() => undefined);
	dialog = await startExport(page);
	await dialog.getByRole('button', { name: 'Export', exact: true }).click();
	const done = page.getByRole('dialog', { name: 'Your file is ready' });
	await expect(done.getByText('Blacked-out words are gone from every page.')).toBeVisible({ timeout: 90_000 });
	await shot(page, info, 'passed');
	const [download] = await Promise.all([page.waitForEvent('download'), done.getByRole('button', { name: 'Download' }).click()]);
	const bytes = new Uint8Array(readFileSync((await download.path())!));
	const texts = textOf(bytes);
	expect(texts).toHaveLength(3);
	expect(texts.join(' ')).toContain('Witness: Sam Lee');
	expect(texts.join(' ').toLowerCase()).not.toContain('jane');
	expect(texts.join(' ').toLowerCase()).not.toContain('doe');
	// Not hidden in the file's bytes either (uncompressed, the content streams would show it).
	expect(Buffer.from(bytes).toString('latin1')).not.toMatch(/Jane|Doe/);
});
