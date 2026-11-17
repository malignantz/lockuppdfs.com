/** The campaign build's start page: the "Booking photo" with the giving band and the rap sheet. */
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
	const photo = page.getByRole('img', { name: /^A booking photo of a PDF document/ });
	await expect(photo).toBeInViewport({ ratio: 1 });
	await expect(page.getByRole('heading', { level: 1, name: 'PDF files. Locked up.' })).toBeInViewport({ ratio: 1 });
	const statement = page.getByText('Free PDF tools. Combine, sign, shrink, convert, redact.');
	await expect(statement).toBeInViewport({ ratio: 1 });
	const choose = page.getByRole('button', { name: 'Choose files' });
	await expect(choose).toBeInViewport({ ratio: 1 });
	const chipList = page.getByRole('list', { name: 'Popular tools' });
	await expect(chipList).toBeInViewport({ ratio: 1 });
	await expect(give(page)).toBeInViewport();
	// Order: photo, headline, statement, then the button, then the tool chips and the reassurance.
	const p = (await photo.boundingBox())!;
	const h = (await page.getByRole('heading', { level: 1 }).boundingBox())!;
	const s = (await statement.boundingBox())!;
	const b = (await choose.boundingBox())!;
	const chips = (await chipList.boundingBox())!;
	expect(p.y).toBeLessThan(h.y);
	expect(h.y).toBeLessThan(s.y);
	expect(s.y).toBeLessThan(b.y);
	expect(b.y).toBeLessThan(chips.y);
	// The main action: full column width, tall.
	expect(b.width).toBeGreaterThanOrEqual(390 - 2 * 24);
	expect(b.height).toBeGreaterThanOrEqual(60);
	// Police-tape yellow, and that colour is the button's alone on the page.
	const bg = await choose.evaluate((el) => getComputedStyle(el).backgroundColor);
	expect(bg).toBe('rgb(255, 210, 31)');
	const others = await page.evaluate((yellow) => {
		const hits: string[] = [];
		for (const el of document.querySelectorAll('body *')) {
			if (el.closest('.choose')) continue;
			const cs = getComputedStyle(el);
			if ([cs.backgroundColor, cs.color, cs.borderTopColor].includes(yellow)) hits.push(el.className.toString());
		}
		return hits;
	}, bg);
	expect(others, 'other elements in the button colour').toEqual([]);
	// The statement is ink black, not grey.
	expect(await statement.evaluate((el) => getComputedStyle(el).color)).toBe('rgb(17, 17, 17)');
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
	await expect(page.getByText('Free PDF tools. Combine, sign, shrink, convert, redact.')).toBeInViewport({ ratio: 1 });
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
	await expect(band).toContainText('We want PDF files charged in a court of law. Give what you would have paid to the people who protect children.');
	await expect(band).toContainText('not run by the charity');
	await expect(band).toContainText('Our goal: $25,000 for NCMEC by November 2027.');
	const ncmec = band.getByRole('link', { name: 'Give to NCMEC' });
	await expect(band.getByRole('link')).toHaveCount(1);
	await expect(ncmec).toHaveAttribute('href', 'https://give.missingkids.org/LockUpPDFs');
	for (const a of [ncmec]) {
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

test('the board in the booking photo states the fee, not a charge, and the rap sheet numbers the tools', async ({ page }) => {
	await page.goto('/');
	const photo = page.getByRole('img', { name: /^A booking photo of a PDF document/ });
	await expect(photo).toHaveAttribute('aria-label', /fee: \$0\.00/);
	const board = (await photo.locator('text').allTextContents()).join(' ');
	expect(board).toContain('FEE:');
	expect(board).toContain('$0.00');
	expect(board).not.toMatch(/charge/i);
	await expect(page.getByRole('heading', { name: 'What you can do' })).toBeVisible();
	await expect(page.locator('#features li').first()).toContainText('01');
});

test('works at 320 px wide with no sideways scroll, and the tool list still opens', async ({ page }) => {
	await page.setViewportSize({ width: 320, height: 640 });
	await page.goto('/');
	await expect(page.getByRole('button', { name: 'Choose files' })).toBeInViewport({ ratio: 1 });
	expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
	const more = page.getByRole('button', { name: /^Show (all 16 tools|fewer)$/ });
	await more.click();
	await expect(more).toHaveAttribute('aria-expanded', 'true');
	await expect(more).toHaveText('Show fewer');
	await expect(page.getByText('Searchable scans')).toBeVisible();
});

test('the header names the campaign site, and the share tags and image are in the static HTML', async ({ page, request }) => {
	await page.goto('/');
	await expect(page.getByRole('link', { name: 'LockUpPDFs, home' })).toBeVisible();
	const html = await (await request.get('/')).text();
	expect(html).toContain('<meta property="og:title" content="LockUpPDFs');
	expect(html).toContain('<meta name="twitter:card" content="summary_large_image" />');
	expect(html).toContain('<meta property="og:image" content="https://lockuppdfs.com/og.png" />');
	// Wording with a dollar sign arrives whole (not read as a $0 backreference), and nothing leaks above the page.
	expect(html).toContain('fee: &#36;0.00.');
	expect(html).toMatch(/<html data-site="lockup"/);
	expect(await page.evaluate(() => document.body.firstChild?.nodeType !== Node.TEXT_NODE || !document.body.firstChild.textContent?.trim())).toBe(true);
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
	expect(out('_redirects')).toBe('/a https://a.lockuppdfs.com/ 302\n/b / 302\n/c https://c.lockuppdfs.com/ 302\n');
	expect(out('_app/precache.json')).not.toContain('_redirects');
});
