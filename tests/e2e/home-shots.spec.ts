/** Screenshots of Home and saved work. Only runs with HOME_SHOTS=<directory>. */
import { fileURLToPath } from 'node:url';
import type { Page } from '@playwright/test';
import { test, expect } from '@playwright/test';

const dir = process.env.HOME_SHOTS;
const corpus = (name: string) => fileURLToPath(new URL(`../corpus/files/${name}`, import.meta.url));
const options = (page: Page) => page.getByRole('option');
const cards = (page: Page) => page.locator('[data-card]');

async function add(page: Page, name: string, pages: number) {
	await page.locator('input[type=file]').first().setInputFiles([corpus(name)]);
	await expect(options(page)).toHaveCount(pages, { timeout: 30_000 });
	await expect(page.getByTestId('save-line')).toContainText('Saved on this device only.');
	await page.waitForTimeout(1500);
}

async function home(page: Page) {
	await page.getByRole('button', { name: 'Home', exact: true }).click();
	await expect(page.getByRole('region', { name: 'Your work' })).toBeVisible();
	await page.waitForTimeout(400);
}

for (const [name, viewport] of [
	['desktop', { width: 1280, height: 800 }],
	['phone', { width: 390, height: 844 }]
] as const) {
	test(`home shots ${name}`, async ({ browser, baseURL }) => {
		test.skip(!dir, 'set HOME_SHOTS');
		test.setTimeout(180_000);
		const ctx = await browser.newContext({ baseURL, viewport, deviceScaleFactor: 1, hasTouch: name === 'phone', isMobile: name === 'phone' });
		const page = await ctx.newPage();
		await page.addInitScript(() => {
			// Slow hashing on demand, so the "Opening" state stays long enough to photograph.
			const digest = crypto.subtle.digest.bind(crypto.subtle);
			crypto.subtle.digest = (async (...a: Parameters<typeof digest>) => {
				if ((window as unknown as { __slow?: boolean }).__slow) await new Promise((r) => setTimeout(r, 2500));
				return digest(...a);
			}) as typeof digest;
			const put = IDBObjectStore.prototype.put;
			IDBObjectStore.prototype.put = function (this: IDBObjectStore, ...args: Parameters<typeof put>) {
				if ((window as unknown as { __full?: boolean }).__full && this.name === 'blobs') throw new DOMException('full', 'QuotaExceededError');
				return put.apply(this, args);
			} as typeof put;
		});
		await page.goto('/');
		await page.waitForTimeout(500);
		await page.screenshot({ path: `${dir}/${name}-1-home-empty.png` });

		await add(page, 'multi.pdf', 6);
		await page.screenshot({ path: `${dir}/${name}-2-project-home-control.png` });
		await home(page);
		await add(page, 'rotated.pdf', 6);
		await home(page);
		await add(page, 'sizes.pdf', 6);
		await home(page);
		await expect(cards(page)).toHaveCount(3);
		await page.screenshot({ path: `${dir}/${name}-3-home-three.png`, fullPage: true });

		await page.evaluate(() => ((window as unknown as { __slow: boolean }).__slow = true));
		await cards(page).nth(2).click();
		await expect(page.getByRole('status').filter({ hasText: 'Opening' })).toBeVisible();
		await page.waitForTimeout(300);
		await page.screenshot({ path: `${dir}/${name}-4-switching.png` });
		await expect(options(page)).toHaveCount(6, { timeout: 30_000 });
		await page.evaluate(() => ((window as unknown as { __slow: boolean }).__slow = false));
		await home(page);

		await page.getByRole('button', { name: 'Forget rotated.pdf' }).click();
		await expect(page.getByRole('dialog', { name: 'Forget this work?' })).toBeVisible();
		await page.waitForTimeout(300);
		await page.screenshot({ path: `${dir}/${name}-5-forget-confirm.png` });
		await page.getByRole('button', { name: 'Cancel' }).click();

		await page.evaluate(() => ((window as unknown as { __full: boolean }).__full = true));
		await page.locator('input[type=file]').first().setInputFiles([corpus('cropbox.pdf')]);
		await expect(page.getByTestId('save-line')).toContainText('not enough room', { timeout: 30_000 });
		await page.waitForTimeout(500);
		await page.screenshot({ path: `${dir}/${name}-6-storage-full-line.png` });
		await home(page);
		await page.screenshot({ path: `${dir}/${name}-7-storage-full-home.png`, fullPage: true });
		await cards(page).first().click();
		await page.getByRole('button', { name: 'Make room' }).click();
		await expect(page.getByRole('dialog', { name: 'Make room for this work' })).toBeVisible();
		await page.waitForTimeout(300);
		await page.screenshot({ path: `${dir}/${name}-8-make-room.png` });
		await ctx.close();
	});
}
