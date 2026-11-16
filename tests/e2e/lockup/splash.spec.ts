/** The campaign build's start page: the "Behind bars" poster with the giving band. */
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { test, expect } from '../fixtures';

const siteSource = readFileSync(fileURLToPath(new URL('../../../src/lib/site/site.ts', import.meta.url)), 'utf8');
const give = (page: import('@playwright/test').Page) => page.getByRole('complementary', { name: 'Give what you saved' });

test('on a 390x844 phone the poster, Choose files and the start of the giving band are in the first screen', async ({ page }) => {
	await page.setViewportSize({ width: 390, height: 844 });
	await page.goto('/');
	await expect(page.getByRole('heading', { level: 1, name: 'LOCK UP PDFs.' })).toBeInViewport();
	await expect(page.getByText('PDF files belong behind bars.')).toBeVisible();
	await expect(page.getByText('Free PDF tools. Nothing to pay at the download.')).toBeVisible();
	await expect(page.getByRole('button', { name: 'Choose files' })).toBeInViewport({ ratio: 1 });
	await expect(give(page)).toBeInViewport();
	const noScroll = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
	expect(noScroll).toBe(true);
});

test('the giving links are on the splash, from site.ts, as plain new-tab links; nothing goes to another host', async ({
	page,
	baseURL
}) => {
	const requests: string[] = [];
	page.on('request', (r) => requests.push(r.url()));
	await page.goto('/');
	const band = give(page);
	await expect(band).toBeVisible();
	await expect(band).toContainText('Give what you saved to the people who protect children');
	await expect(band).toContainText('not connected to either charity');
	const ncmec = band.getByRole('link', { name: 'Give to NCMEC' });
	const thorn = band.getByRole('link', { name: 'Give to Thorn' });
	await expect(ncmec).toHaveAttribute('href', 'https://give.missingkids.org/');
	await expect(thorn).toHaveAttribute('href', 'https://www.thorn.org/donate/');
	for (const a of [ncmec, thorn]) {
		expect(siteSource).toContain((await a.getAttribute('href'))!);
		await expect(a).toHaveAttribute('target', '_blank');
		await expect(a).toHaveAttribute('rel', 'noopener noreferrer');
		await expect(a).not.toHaveAttribute('ping', /.*/);
	}
	// Fonts, icons and everything else come from this site only.
	await page.evaluate(() => document.fonts.ready);
	const origin = new URL(baseURL!).origin;
	const outside = requests.filter((u) => !u.startsWith('data:') && !u.startsWith('blob:') && new URL(u).origin !== origin);
	expect(outside, 'requests to other origins').toEqual([]);
	// The display face is the bundled one, and it loaded.
	expect(await page.evaluate(() => document.fonts.check("1em 'Lockup Display'"))).toBe(true);
});

test('the campaign page never spells out the slang or names the owner', async ({ page }) => {
	await page.goto('/');
	const text = (await page.locator('body').innerText()).toLowerCase();
	expect(text).not.toMatch(/pedo|paedo|garrett|holmes|partner|official/);
});

test('works at 320 px wide with no sideways scroll, and the tool list still opens', async ({ page }) => {
	await page.setViewportSize({ width: 320, height: 640 });
	await page.goto('/');
	await expect(page.getByRole('button', { name: 'Choose files' })).toBeInViewport({ ratio: 1 });
	expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
	const more = page.getByRole('button', { name: 'More it can do' });
	await more.click();
	await expect(more).toHaveAttribute('aria-expanded', 'true');
	await expect(page.getByText('Searchable scans')).toBeVisible();
});

test('the header names the campaign site, and the share tags and image are in the static HTML', async ({ page, request }) => {
	await page.goto('/');
	await expect(page.getByRole('link', { name: 'LockUpPDFs, home' })).toBeVisible();
	const html = await (await request.get('/')).text();
	expect(html).toContain('<meta property="og:title" content="LockUpPDFs');
	expect(html).toContain('<meta name="twitter:card" content="summary_large_image" />');
	expect(html).toContain('<meta property="og:image" content="https://lockuppdfs.com/og.png" />');
	const og = await request.get('/og.png');
	expect(og.ok()).toBe(true);
	expect(og.headers()['content-type']).toContain('image/png');
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
