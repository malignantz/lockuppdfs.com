import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { test, expect } from '../fixtures';

// All campaign wording and links live in site.ts; the page must show exactly those.
const siteSource = readFileSync(fileURLToPath(new URL('../../../src/lib/site/site.ts', import.meta.url)), 'utf8');
const hrefs = [...siteSource.matchAll(/href: '([^']+)'/g)].map((m) => m[1]);

test('the splash: the booking photo, the headline, and Choose files plus the giving band on the first phone screen', async ({
	browser,
	baseURL
}) => {
	const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, baseURL });
	const page = await context.newPage();
	const requests: string[] = [];
	page.on('request', (r) => requests.push(r.url()));
	await page.goto('/');
	await page.evaluate(() => document.fonts.ready);

	await expect(page.getByRole('heading', { level: 1, name: 'PDFs. Locked up.' })).toBeVisible();
	await expect(page.getByText('Free PDF tools with no charge at the download.')).toBeVisible();
	await expect(page.getByRole('img', { name: /booking photo of a PDF document/ })).toBeInViewport();

	await expect(page.getByRole('button', { name: 'Choose files' })).toBeInViewport({ ratio: 1 });
	const give = page.getByRole('region', { name: 'The money you saved' });
	await expect(give).toBeInViewport();
	const top = (await give.boundingBox())!.y;
	expect(top).toBeLessThan(844 - 40);

	expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);

	// Nothing is fetched from anywhere but this site.
	const origin = new URL(baseURL!).origin;
	const outside = requests.filter((u) => !u.startsWith('data:') && !u.startsWith('blob:') && new URL(u).origin !== origin);
	expect(outside, 'requests to other origins').toEqual([]);
	await context.close();
});

test('the giving band links straight to each charity, in a new tab, with the note', async ({ page }) => {
	await page.goto('/');
	const give = page.getByRole('region', { name: 'The money you saved' });
	await expect(give).toContainText('Give what you saved to the people who protect children');
	await expect(give).toContainText('not connected to either charity');
	const links = await give.getByRole('link').all();
	expect(links.length).toBe(2);
	expect(hrefs.length).toBe(2);
	for (const [i, a] of links.entries()) {
		await expect(a).toHaveAttribute('href', hrefs[i]);
		await expect(a).toHaveAttribute('target', '_blank');
		await expect(a).toHaveAttribute('rel', /noopener/);
	}
	await expect(links[0]).toHaveText('Give to NCMEC');
	await expect(links[1]).toHaveText('Give to Thorn');
});

test('the tool list still works, and the page fits 320 px', async ({ browser, baseURL }) => {
	const context = await browser.newContext({ viewport: { width: 320, height: 640 }, baseURL });
	const page = await context.newPage();
	await page.goto('/');
	await expect(page.getByRole('heading', { level: 2, name: 'What you can do' })).toBeVisible();
	const items = page.locator('#features li');
	await expect(items).toHaveCount(8);
	await page.getByRole('button', { name: 'More it can do' }).click();
	await expect(items).toHaveCount(16);
	expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
	await context.close();
});

test('the header names the campaign site, and the social tags are in the static HTML', async ({ page, request }) => {
	await page.goto('/');
	await expect(page.getByRole('link', { name: 'LockUpPDFs, home' })).toBeVisible();
	const html = await (await request.get('/')).text();
	expect(html).toContain('<html lang="en" data-site="lockup">');
	expect(html).toContain('<meta property="og:title" content="LockUpPDFs');
	expect(html).toContain('<meta name="twitter:card" content="summary_large_image" />');
	expect(html).toContain('<meta property="og:image" content="https://lockuppdfs.com/og.png" />');
	const og = await request.get('/og.png');
	expect(og.ok()).toBe(true);
	expect(og.headers()['content-type']).toContain('image/png');
	const manifest = await (await request.get('/manifest.webmanifest')).json();
	expect(manifest.name).toBe('LockUpPDFs');
	expect(await (await request.get('/favicon.svg')).text()).toContain('LockUpPDFs mark');
});

test('same CSP, no-transform and a service worker that stays on this origin', async ({ request }) => {
	const res = await request.get('/');
	expect(res.headers()['content-security-policy']).toContain("connect-src 'self'");
	expect(res.headers()['cache-control']).toContain('no-transform');
	const html = await res.text();
	expect(html).not.toContain('pdf.garrettholmes.com');
	expect(html).not.toContain('rel="canonical"');
});
