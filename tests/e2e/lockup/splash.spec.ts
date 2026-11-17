/** The campaign build's start page: the "Behind bars" poster with the giving band. */
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { test, expect } from '../fixtures';

const siteSource = readFileSync(fileURLToPath(new URL('../../../src/lib/site/site.ts', import.meta.url)), 'utf8');
const give = (page: import('@playwright/test').Page) => page.getByRole('complementary', { name: 'Donate to charity, not PDF software companies.' });

test('on a 390x844 phone the first screen says what the site is, shows the button and the start of the giving band', async ({
	browser,
	baseURL
}) => {
	// A real phone: touch, no hover, so no drop area.
	const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, baseURL });
	const page = await ctx.newPage();
	await page.goto('/');
	await expect(page.locator('.art .lk-icon')).toBeInViewport({ ratio: 1 });
	await expect(page.getByRole('heading', { level: 1, name: 'LOCK UP PDFs.' })).toBeInViewport({ ratio: 1 });
	await expect(page.getByText('PDF files belong behind bars.')).toBeInViewport({ ratio: 1 });
	const statement = page.getByText('Free PDF tools. Combine, sign, shrink, convert.');
	await expect(statement).toBeInViewport({ ratio: 1 });
	const choose = page.getByRole('button', { name: 'Choose files' });
	await expect(choose).toBeInViewport({ ratio: 1 });
	await expect(give(page)).toBeInViewport();
	// Order: statement, then the button, then the tool chips and the reassurance.
	const s = (await statement.boundingBox())!;
	const b = (await choose.boundingBox())!;
	const chips = (await page.getByRole('list', { name: 'Popular tools' }).boundingBox())!;
	expect(s.y).toBeLessThan(b.y);
	expect(b.y).toBeLessThan(chips.y);
	// The main action: full column width, tall.
	expect(b.width).toBeGreaterThanOrEqual(390 - 2 * 24);
	expect(b.height).toBeGreaterThanOrEqual(60);
	// Its colour is its own: not the orange of the tagline, not the off-white of the type.
	const bg = await choose.evaluate((el) => getComputedStyle(el).backgroundColor);
	const tagline = await page.getByText('PDF files belong behind bars.').evaluate((el) => getComputedStyle(el).color);
	const ink = await statement.evaluate((el) => getComputedStyle(el).color);
	expect(bg).not.toBe(tagline);
	expect(bg).not.toBe(ink);
	// The statement is bright, not grey.
	expect(ink).toBe('rgb(244, 239, 230)');
	await expect(page.getByText('No account. Files never leave your device.')).toBeVisible();
	await expect(page.getByText('or drop files here')).toBeHidden();
	const noScroll = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
	expect(noScroll).toBe(true);
	await ctx.close();
});

test('the tool chips open the picker, for pictures only on Pictures to PDF', async ({ page }) => {
	await page.goto('/');
	const chips = page.getByRole('list', { name: 'Popular tools' });
	for (const [name, accept] of [
		['Combine', 'application/pdf,.pdf'],
		['Fill & sign', 'application/pdf,.pdf'],
		['Make smaller', 'application/pdf,.pdf'],
		['Pictures to PDF', /^image\//]
	] as const) {
		const [chooser] = await Promise.all([page.waitForEvent('filechooser'), chips.getByRole('button', { name }).click()]);
		expect(chooser.isMultiple()).toBe(true);
		const got = await chooser.element().getAttribute('accept');
		if (typeof accept === 'string') expect(got).toBe(accept);
		else expect(got).toMatch(accept);
		await chooser.setFiles([]);
	}
	// Each chip is a tool from the full list below.
	for (const t of ['Combine files', 'Fill in and sign', 'Make it smaller', 'Pictures to PDF']) {
		await expect(page.locator('#features').getByText(t, { exact: true })).toBeAttached();
	}
	// The main button offers every file type again.
	const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.getByRole('button', { name: 'Choose files' }).click()]);
	expect(await chooser.element().getAttribute('accept')).toContain('image/heic');
});

test('on a desktop the button sits in a drawn drop area that says so', async ({ page }) => {
	await page.setViewportSize({ width: 1280, height: 800 });
	await page.goto('/');
	const choose = page.getByRole('button', { name: 'Choose files' });
	await expect(choose).toBeInViewport({ ratio: 1 });
	await expect(page.getByText('or drop files here')).toBeVisible();
	expect(await page.locator('.cta').evaluate((el) => getComputedStyle(el).borderStyle)).toBe('dashed');
	expect((await choose.boundingBox())!.height).toBeGreaterThanOrEqual(60);
	await expect(page.getByText('Free PDF tools. Combine, sign, shrink, convert.')).toBeInViewport({ ratio: 1 });
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
	await expect(band.getByRole('heading', { name: 'Donate to charity, not PDF software companies.' })).toBeVisible();
	await expect(band).toContainText('Give what you would have paid to the people who protect children from the other kind.');
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

test('the forwards file reaches the campaign build and is not precached', () => {
	const out = (f: string) => readFileSync(fileURLToPath(new URL(`../../../build-lockup/${f}`, import.meta.url)), 'utf8');
	expect(out('_redirects')).toBe('/a / 302\n/b https://b.lockuppdfs.com/ 302\n/c https://c.lockuppdfs.com/ 302\n');
	expect(out('_app/precache.json')).not.toContain('_redirects');
});
