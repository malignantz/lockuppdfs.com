/**
 * Screenshots of Mark for blackout (Find bar button, confirm, export dialog's words, a refused
 * export) on a desktop, a phone and the LockUpPDFs build, at device scale 1. Only runs with
 * BLACKOUT_SHOTS=<directory>.
 */
import { fileURLToPath } from 'node:url';
import type { Page } from '@playwright/test';
import { test, expect } from '@playwright/test';

const dir = process.env.BLACKOUT_SHOTS;
const corpus = (name: string) => fileURLToPath(new URL(`../corpus/files/${name}`, import.meta.url));

async function snap(page: Page, name: string) {
	await page.waitForTimeout(400);
	await page.screenshot({ path: `${dir}/${name}.png` });
}

for (const [name, viewport, site] of [
	['desktop', { width: 1280, height: 800 }, 'main'],
	['phone', { width: 390, height: 780 }, 'main'],
	['lockup-desktop', { width: 1280, height: 800 }, 'lockup']
] as const) {
	test(`blackout shots ${name}`, async ({ browser, baseURL }, info) => {
		test.skip(!dir || info.project.name !== 'desktop-chrome', 'set BLACKOUT_SHOTS (runs in the desktop project)');
		test.setTimeout(150_000);
		const url = new URL(baseURL!);
		if (site === 'lockup') url.port = String(Number(url.port) + 1);
		const phone = name === 'phone';
		const ctx = await browser.newContext({ baseURL: url.origin, viewport, deviceScaleFactor: 1, hasTouch: phone, isMobile: phone });
		const page = await ctx.newPage();
		await page.goto('/');
		await page.locator('input[type=file]').first().setInputFiles(corpus('blackout-names.pdf'));
		await expect(page.getByRole('option')).toHaveCount(4, { timeout: 30_000 });
		await page.locator('[data-testid^="find-open"]:visible').first().click();
		const bar = page.getByTestId('find-bar');
		await bar.getByRole('searchbox').fill('Jane Doe');
		const mark = bar.getByRole('button', { name: 'Mark 4 for blackout' });
		await expect(mark).toBeVisible({ timeout: 30_000 });
		await expect(bar.getByTestId('find-note')).toHaveCount(0, { timeout: 30_000 });
		await snap(page, `find-bar-${name}`);
		await mark.click();
		const confirm = page.getByRole('dialog', { name: /^Add 4 blackout boxes/ });
		await expect(confirm).toBeVisible();
		await snap(page, `confirm-${name}`);
		await confirm.getByRole('button', { name: 'Mark 4' }).click();
		await expect(page.getByText(/blackout boxes added/)).toBeVisible();
		await bar.getByRole('button', { name: 'Close find' }).click();
		await page.getByRole('button', { name: 'Export', exact: true }).first().click();
		const dialog = page.getByRole('dialog', { name: 'Export PDF' });
		await expect(dialog.getByTestId('blackout-terms')).toBeVisible();
		await dialog.getByTestId('blackout-terms').scrollIntoViewIfNeeded();
		await snap(page, `export-terms-${name}`);
		await dialog.getByRole('button', { name: 'Export', exact: true }).click();
		await expect(page.getByRole('dialog', { name: 'Export stopped' })).toBeVisible({ timeout: 90_000 });
		await snap(page, `refused-${name}`);
		await ctx.close();
	});
}
