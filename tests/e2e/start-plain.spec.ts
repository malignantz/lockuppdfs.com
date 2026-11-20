import { fileURLToPath } from 'node:url';
import { test, expect } from './fixtures';

test('the plain site has no campaign pitch and keeps its own title', async ({ page, request }) => {
	await page.goto('/');
	await expect(page).toHaveTitle('PDF Workspace · pdf.garrettholmes.com');
	await expect(page.getByRole('heading', { name: 'Free, including the download.' })).toHaveCount(0);
	await expect(page.getByText('charge you for the file')).toHaveCount(0);
	await expect(page.locator('.pitch')).toHaveCount(0);
	await expect(page.getByRole('link', { name: 'pdf.garrettholmes.com, home' })).toBeVisible();
	const html = await (await request.get('/')).text();
	expect(html).not.toContain('og:title');
	expect(html).not.toContain('LockUpPDFs');
});

test('the plain site never posts tool use: open, rotate, export', async ({ page }) => {
	test.setTimeout(90_000);
	const posts: string[] = [];
	page.on('request', (r) => {
		if (new URL(r.url()).pathname === '/use') posts.push(r.url());
	});
	await page.goto('/');
	await page.locator('input[type=file]').first().setInputFiles([fileURLToPath(new URL('../corpus/files/multi.pdf', import.meta.url))]);
	await expect(page.getByRole('option')).toHaveCount(6, { timeout: 30_000 });
	await page.getByRole('option').first().click();
	await page.keyboard.press('r');
	await expect(page.getByRole('option').first()).toHaveAttribute('aria-label', /rotated 90°/);
	await page.getByRole('button', { name: 'Export', exact: true }).click();
	await page.getByRole('dialog', { name: 'Export PDF' }).getByRole('button', { name: 'Export', exact: true }).click();
	await expect(page.getByRole('dialog', { name: 'Your file is ready' }).getByRole('button', { name: 'Download' })).toBeVisible({ timeout: 60_000 });
	await page.waitForTimeout(300);
	expect(posts).toEqual([]);
});
