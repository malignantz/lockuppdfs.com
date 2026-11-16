/** The campaign build's start page: the pun, the giving card, the tools. */
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { test, expect } from '../fixtures';

// All campaign wording and links live in site.ts; the page must show exactly those.
const siteSource = readFileSync(fileURLToPath(new URL('../../../src/lib/site/site.ts', import.meta.url)), 'utf8');

test('on a phone the first screen holds the pun, Choose files and the start of the giving card', async ({ browser, baseURL }) => {
	const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, baseURL });
	const page = await context.newPage();
	const requests: string[] = [];
	page.on('request', (r) => requests.push(r.url()));
	await page.goto('/');
	await expect(page.getByRole('heading', { level: 1, name: 'Lock up PDFs.' })).toBeInViewport({ ratio: 1 });
	await expect(page.getByText('Yes, both kinds.')).toBeInViewport({ ratio: 1 });
	await expect(page.getByText('The other kind of PDF file belongs in prison.')).toBeVisible();
	await expect(page.getByRole('button', { name: 'Choose files' })).toBeInViewport({ ratio: 1 });
	await expect(page.getByRole('heading', { name: 'Saved a few dollars?' })).toBeInViewport({ ratio: 1 });
	expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
	// The typeface is this site's own file.
	await page.evaluate(() => document.fonts.ready);
	expect(await page.evaluate(() => document.fonts.check('700 16px Geist'))).toBe(true);
	const origin = new URL(baseURL!).origin;
	expect(requests.filter((u) => !u.startsWith('data:') && !u.startsWith('blob:') && new URL(u).origin !== origin)).toEqual([]);
	await context.close();
});

test('the giving card links straight to each charity, from site.ts, in a new tab', async ({ page }) => {
	await page.goto('/');
	const card = page.getByRole('complementary', { name: 'Saved a few dollars?' });
	await expect(card).toBeVisible();
	const lead = (await card.locator('.give-lead').innerText()).trim();
	const note = (await card.locator('.give-note').innerText()).trim();
	expect(siteSource).toContain(lead);
	expect(siteSource).toContain(note);
	expect(note).toContain('not connected to either charity');
	const ncmec = card.getByRole('link', { name: 'Give to NCMEC' });
	const thorn = card.getByRole('link', { name: 'Give to Thorn' });
	await expect(ncmec).toHaveAttribute('href', 'https://give.missingkids.org/');
	await expect(thorn).toHaveAttribute('href', 'https://www.thorn.org/donate/');
	for (const a of [ncmec, thorn]) {
		await expect(a).toHaveAttribute('target', '_blank');
		await expect(a).toHaveAttribute('rel', /noopener/);
		await expect(a).not.toHaveAttribute('ping', /.*/);
	}
	// Nothing is spelled out that should not be, and nobody is named.
	const text = (await page.locator('main').innerText()).toLowerCase();
	for (const word of ['pedo', 'paedo', 'garrett', 'partner', 'official']) expect(text).not.toContain(word);
});

test('the tool list works below the fold, and Choose files opens the picker', async ({ page }) => {
	await page.setViewportSize({ width: 390, height: 844 });
	await page.goto('/');
	const list = page.locator('#features');
	await expect(list.getByText('Combine files')).toBeVisible();
	const more = page.getByRole('button', { name: 'More it can do' });
	const before = await list.locator('li').count();
	await more.click();
	await expect(more).toHaveAttribute('aria-expanded', 'true');
	expect(await list.locator('li').count()).toBeGreaterThan(before);
	const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.getByRole('button', { name: 'Choose files' }).click()]);
	expect(chooser.isMultiple()).toBe(true);
});

test('at 320 px nothing scrolls sideways', async ({ page }) => {
	await page.setViewportSize({ width: 320, height: 640 });
	await page.goto('/');
	await expect(page.getByRole('button', { name: 'Choose files' })).toBeInViewport({ ratio: 1 });
	expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('the header names the campaign site, and the share tags are in the static HTML', async ({ page, request }) => {
	await page.goto('/');
	await expect(page.getByRole('link', { name: 'LockUpPDFs, home' })).toBeVisible();
	const html = await (await request.get('/')).text();
	expect(html).toContain('<meta property="og:title" content="LockUpPDFs');
	expect(html).toContain('<meta property="og:image" content="https://lockuppdfs.com/og.png" />');
	expect(html).toContain('<meta name="twitter:card" content="summary_large_image" />');
	expect(html).toContain('<meta name="twitter:image" content="https://lockuppdfs.com/og.png" />');
	const og = await request.get('/og.png');
	expect(og.ok()).toBe(true);
	expect(og.headers()['content-type']).toContain('image/png');
	// The campaign icon replaces the plain site's in this build.
	expect(await (await request.get('/favicon.svg')).text()).toContain('#4a68ff');
	const manifest = await (await request.get('/manifest.webmanifest')).json();
	expect(manifest.name).toBe('LockUpPDFs');
	expect(manifest.theme_color).toBe('#ffffff');
});

test('same CSP, no-transform and a service worker that stays on this origin', async ({ request }) => {
	const res = await request.get('/');
	expect(res.headers()['content-security-policy']).toContain("connect-src 'self'");
	expect(res.headers()['cache-control']).toContain('no-transform');
	const html = await res.text();
	expect(html).not.toContain('pdf.garrettholmes.com');
	expect(html).not.toContain('rel="canonical"');
});
