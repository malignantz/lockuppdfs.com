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
