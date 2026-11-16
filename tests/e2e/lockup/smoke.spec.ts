import { test, expect } from '../fixtures';

test('the campaign build carries the LockUpPDFs title', async ({ page }) => {
	await page.goto('/');
	await expect(page).toHaveTitle(/LockUpPDFs/);
});
