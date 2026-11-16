import { test, expect } from '../fixtures';

test('the start page shows the pitch, and Choose files stays in view on a phone', async ({ page }) => {
	await page.setViewportSize({ width: 390, height: 844 });
	await page.goto('/');
	await expect(page.getByRole('heading', { name: 'Free, including the download.' })).toBeVisible();
	await expect(page.getByText('Some PDF sites let you do the work and then charge you for the file.')).toBeVisible();
	const button = page.getByRole('button', { name: 'Choose files' });
	await expect(button).toBeInViewport({ ratio: 1 });
	await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
});

test('the header names the campaign site, and the social tags are in the static HTML', async ({ page, request }) => {
	await page.goto('/');
	await expect(page.getByRole('link', { name: 'LockUpPDFs, home' })).toBeVisible();
	const html = await (await request.get('/')).text();
	expect(html).toContain('<meta property="og:title" content="LockUpPDFs');
	expect(html).toContain('<meta name="twitter:card"');
	const manifest = await (await request.get('/manifest.webmanifest')).json();
	expect(manifest.name).toBe('LockUpPDFs');
});

test('same CSP, no-transform and a service worker that stays on this origin', async ({ request }) => {
	const res = await request.get('/');
	expect(res.headers()['content-security-policy']).toContain("connect-src 'self'");
	expect(res.headers()['cache-control']).toContain('no-transform');
	const html = await res.text();
	expect(html).not.toContain('pdf.garrettholmes.com');
	expect(html).not.toContain('rel="canonical"');
});
