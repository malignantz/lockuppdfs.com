/** The plain site shows no donation ask after an export: the result screen is as it always was. */
import { fileURLToPath } from 'node:url';
import { test, expect } from './fixtures';

const corpus = (name: string) => fileURLToPath(new URL(`../corpus/files/${name}`, import.meta.url));

test('plain build: no donation ask after an export or a download', async ({ page }) => {
	test.setTimeout(90_000);
	await page.goto('/');
	await page.locator('input[type=file]').first().setInputFiles([corpus('multi.pdf')]);
	await expect(page.getByRole('option')).toHaveCount(6, { timeout: 30_000 });
	await page.getByRole('button', { name: 'Export', exact: true }).click();
	const form = page.getByRole('dialog', { name: 'Export PDF' });
	await form.getByRole('button', { name: 'Export', exact: true }).click();
	const done = page.getByRole('dialog', { name: 'Your file is ready' });
	await expect(done.getByRole('button', { name: 'Download' })).toBeVisible({ timeout: 60_000 });
	await expect(page.getByRole('complementary', { name: 'A note after your download' })).toHaveCount(0);
	const [download] = await Promise.all([page.waitForEvent('download'), done.getByRole('button', { name: 'Download' }).click()]);
	expect(download.suggestedFilename()).toMatch(/\.pdf$/);
	await expect(done.getByText('Saved. You can keep working')).toBeVisible();
	await expect(page.getByRole('complementary', { name: 'A note after your download' })).toHaveCount(0);
	await expect(page.getByRole('button', { name: 'Not now' })).toHaveCount(0);
	await expect(page.locator('a[href*="missingkids"], a[href*="thorn.org"]')).toHaveCount(0);
});
