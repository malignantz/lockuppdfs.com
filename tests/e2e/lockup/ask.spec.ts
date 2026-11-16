/** The campaign build: the quiet donation note after a saved export. */
import { fileURLToPath } from 'node:url';
import type { Page } from '@playwright/test';
import { test, expect } from '../fixtures';
import { mark, shift } from '../stable-helpers';
import { readFileSync } from 'node:fs';

// All campaign wording and links live in site.ts; the page must show exactly those.
const siteSource = readFileSync(fileURLToPath(new URL('../../../src/lib/site/site.ts', import.meta.url)), 'utf8');

const corpus = (name: string) => fileURLToPath(new URL(`../../corpus/files/${name}`, import.meta.url));

const ask = (page: Page) => page.getByRole('complementary', { name: 'A note after your download' });

async function exportFile(page: Page) {
	await page.getByRole('button', { name: 'Export', exact: true }).click();
	const form = page.getByRole('dialog', { name: 'Export PDF' });
	await form.getByRole('button', { name: 'Export', exact: true }).click();
	const done = page.getByRole('dialog', { name: 'Your file is ready' });
	await expect(done.getByRole('button', { name: 'Download' })).toBeVisible({ timeout: 60_000 });
	return done;
}

test('after a real export: download first, then one quiet note; dismissed it stays away; no outside request', async ({
	page,
	baseURL
}) => {
	test.setTimeout(120_000);
	const requests: string[] = [];
	page.on('request', (r) => requests.push(r.url()));

	await page.goto('/');
	await page.locator('input[type=file]').first().setInputFiles([corpus('multi.pdf')]);
	await expect(page.getByRole('option')).toHaveCount(6, { timeout: 30_000 });

	// Before and during the export, and on the finished screen before saving: no ask.
	await page.getByRole('button', { name: 'Export', exact: true }).click();
	await expect(ask(page)).toHaveCount(0);
	const form = page.getByRole('dialog', { name: 'Export PDF' });
	await form.getByRole('button', { name: 'Export', exact: true }).click();
	const done = page.getByRole('dialog', { name: 'Your file is ready' });
	await expect(done.getByRole('button', { name: 'Download' })).toBeVisible({ timeout: 60_000 });
	await expect(ask(page)).toHaveCount(0);

	await mark(done, null);
	// The download happens on its own; the note follows it.
	const [download] = await Promise.all([page.waitForEvent('download'), done.getByRole('button', { name: 'Download' }).click()]);
	expect(download.suggestedFilename()).toMatch(/\.pdf$/);
	await expect(ask(page)).toBeVisible();
	// The note arriving moves nothing: not the dialog frame, nothing above it.
	const moved = await shift(page);
	expect(moved.frame, `the dialog frame moved (${moved.frameWhat})`).toBeLessThanOrEqual(1);
	expect(moved.above, `something above moved (${moved.aboveWhat})`).toBeLessThanOrEqual(1);
	const lead = (await ask(page).locator('.lead').innerText()).trim();
	const note = (await ask(page).locator('.note').innerText()).trim();
	expect(siteSource, 'lead comes from site.ts').toContain(lead);
	expect(siteSource, 'note comes from site.ts').toContain(note);
	const links = await ask(page).getByRole('link').all();
	expect(links.length).toBeGreaterThanOrEqual(2);
	for (const a of links) {
		const href = (await a.getAttribute('href'))!;
		expect(href).toMatch(/^https:\/\//);
		expect(siteSource, 'link comes from site.ts').toContain(href);
		expect(siteSource).toContain((await a.textContent())!.trim());
		await expect(a).toHaveAttribute('target', '_blank');
		await expect(a).toHaveAttribute('rel', 'noopener noreferrer');
		await expect(a).not.toHaveAttribute('ping', /.*/);
	}
	// No pop-up: the note is not a dialog of its own.
	await expect(page.getByRole('dialog')).toHaveCount(1);

	// Dismiss it.
	await ask(page).getByRole('button', { name: 'Not now' }).click();
	await expect(ask(page)).toHaveCount(0);
	await expect(done.getByText('Saved. You can keep working')).toBeVisible();

	// A second export in the same visit: it downloads, and the note stays away.
	await done.getByRole('button', { name: 'Done' }).click();
	await expect(done).toBeHidden();
	const done2 = await exportFile(page);
	const [download2] = await Promise.all([page.waitForEvent('download'), done2.getByRole('button', { name: 'Download' }).click()]);
	expect(download2.suggestedFilename()).toMatch(/\.pdf$/);
	await expect(done2.getByText('Saved. You can keep working')).toBeVisible();
	await expect(ask(page)).toHaveCount(0);

	// The whole flow touched only this site.
	const origin = new URL(baseURL!).origin;
	const outside = requests.filter((u) => !u.startsWith('data:') && !u.startsWith('blob:') && new URL(u).origin !== origin);
	expect(outside, 'requests to other origins').toEqual([]);
});

test('the download completes on its own, with the note shown only afterwards', async ({ page }) => {
	test.setTimeout(90_000);
	await page.goto('/');
	await page.locator('input[type=file]').first().setInputFiles([corpus('multi.pdf')]);
	await expect(page.getByRole('option')).toHaveCount(6, { timeout: 30_000 });
	const done = await exportFile(page);
	const [download] = await Promise.all([page.waitForEvent('download'), done.getByRole('button', { name: 'Download' }).click()]);
	expect(await download.failure()).toBeNull();
	expect(download.suggestedFilename()).toMatch(/\.pdf$/);
	await expect(ask(page)).toBeVisible();
});

test('the privacy page explains the donation links', async ({ page }) => {
	await page.goto('/privacy');
	await expect(page.locator('body')).not.toContainText('pdf.garrettholmes.com');
	await expect(page.locator('main code', { hasText: 'lockuppdfs.com' })).toBeVisible();
	const section = page.locator('#donation-links');
	await expect(section).toBeVisible();
	await expect(section).toContainText('not connected to either charity');
	await expect(section).toContainText('does not know whether a link was followed');
});

test('the note fits a phone-width screen and its controls are comfortable to tap', async ({ browser, baseURL }) => {
	test.setTimeout(120_000);
	const context = await browser.newContext({ viewport: { width: 390, height: 780 }, hasTouch: true, isMobile: true, baseURL });
	const page = await context.newPage();
	await page.goto('/');
	await page.locator('input[type=file]').first().setInputFiles([corpus('multi.pdf')]);
	await expect(page.getByRole('option')).toHaveCount(6, { timeout: 30_000 });
	const done = await exportFile(page);
	await Promise.all([page.waitForEvent('download'), done.getByRole('button', { name: 'Download' }).click()]);
	await expect(ask(page)).toBeVisible();
	const noScroll = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
	expect(noScroll).toBe(true);
	for (const el of [ask(page).getByRole('button', { name: 'Not now' }), ...(await ask(page).getByRole('link').all())]) {
		await el.scrollIntoViewIfNeeded();
		const box = (await el.boundingBox())!;
		expect(box.height).toBeGreaterThanOrEqual(43.5);
	}
	await context.close();
});
