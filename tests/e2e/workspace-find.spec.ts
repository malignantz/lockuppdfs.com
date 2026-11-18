// Find: an invisible text layer over every page with text, so the browser's own Find
// (Ctrl/Cmd+F) finds words on any page of the grid, and a Find bar that counts matches
// and steps through them (the phone's way, and page to page in the editor).
// Corpus: find-text.pdf (tests/corpus/generate-find.mjs).
import { fileURLToPath } from 'node:url';
import type { Page, TestInfo } from '@playwright/test';
import { test, expect } from './fixtures';

const corpus = (name: string) => fileURLToPath(new URL(`../corpus/files/${name}`, import.meta.url));
const isPhone = (info: TestInfo) => info.project.name === 'phone';

async function open(page: Page, name = 'find-text.pdf', n = 8) {
	await page.goto('/');
	await page.locator('input[type=file]').first().setInputFiles(corpus(name));
	await expect(page.getByRole('option')).toHaveCount(n, { timeout: 30_000 });
}

/** The visible Find button (top bar on a desktop, the dock on a phone, floating in the phone editor). */
const findButton = (page: Page) => page.locator('[data-testid^="find-open"]:visible').first();
const bar = (page: Page) => page.getByTestId('find-bar');
const field = (page: Page) => bar(page).getByRole('searchbox', { name: 'Find in document' });
const count = (page: Page) => bar(page).getByTestId('find-count');

/** Lines in each tile's layer, in page order. */
const layerLines = (page: Page) =>
	page.getByRole('option').evaluateAll((els) => els.map((e) => [...e.querySelectorAll('.text-layer .ln')].map((l) => l.textContent)));

test('every page with text gets an invisible layer of its lines; the browser’s Find finds a phrase on a later page', async ({ page }, info) => {
	await open(page);
	if (isPhone(info)) {
		// A phone reads nothing until Find is opened (MuPDF stays unloaded).
		await page.waitForTimeout(1500);
		expect(await page.locator('.text-layer').count()).toBe(0);
		await findButton(page).tap();
		await expect(bar(page)).toBeVisible();
	}
	await expect.poll(async () => (await layerLines(page)).map((l) => l.length > 0), { timeout: 30_000 }).toEqual([true, true, true, true, true, true, true, false]);
	const lines = await layerLines(page);
	// One element per line, words joined by single spaces; the two lines stay apart.
	expect(lines[0]).toEqual(['Quarterly statement', 'The amount below is the Amount total', 'due next month for the account.', 'Thank you for your business.']);
	expect(lines[5]).toContain('Total due: 1,250.00');
	expect(lines[6]).toEqual(['quarterly report sideways']);

	// Invisible, out of the way, hidden from assistive technology.
	const style = await page.locator('.text-layer').first().evaluate((el) => {
		const s = getComputedStyle(el);
		const ln = getComputedStyle(el.querySelector('.ln')!);
		return { pe: s.pointerEvents, us: s.userSelect, color: ln.color, hidden: el.getAttribute('aria-hidden') };
	});
	expect(style).toEqual({ pe: 'none', us: 'none', color: 'rgba(0, 0, 0, 0)', hidden: 'true' });

	if (isPhone(info)) return;
	// window.find is Chrome's find-in-page over the DOM. The layer is not selectable, so for this
	// check only selection is allowed, which lets the match be located.
	const found = await page.evaluate(() => {
		const st = document.createElement('style');
		st.textContent = '[role=option], .text-layer, .text-layer * { user-select: text !important; -webkit-user-select: text !important }';
		document.head.append(st);
		const out: Record<string, { found: boolean; tile?: string | null; rect?: { x: number; y: number; w: number; h: number }; page?: { x: number; y: number; w: number; h: number } }> = {};
		for (const q of ['Total due', 'amount total due', 'quarterly report sideways', 'invoice number 104']) {
			getSelection()!.removeAllRanges();
			const ok = (window as unknown as { find: (s: string, c: boolean, b: boolean, w: boolean) => boolean }).find(q, false, false, true);
			if (!ok || !getSelection()!.rangeCount) {
				out[q] = { found: ok };
				continue;
			}
			const range = getSelection()!.getRangeAt(0);
			const tile = range.startContainer.parentElement!.closest('[role=option]');
			const r = range.getBoundingClientRect();
			const p = tile!.querySelector('.page')!.getBoundingClientRect();
			out[q] = { found: true, tile: tile?.getAttribute('aria-label'), rect: { x: r.x, y: r.y, w: r.width, h: r.height }, page: { x: p.x, y: p.y, w: p.width, h: p.height } };
		}
		st.remove();
		getSelection()!.removeAllRanges();
		return out;
	});
	expect(found['Total due'].tile).toMatch(/^Page 6,/);
	expect(found['quarterly report sideways'].tile).toMatch(/^Page 7,/);
	expect(found['invoice number 104'].tile).toMatch(/^Page 4,/);
	// "total" ends one line and "due" starts the next: never one phrase.
	expect(found['amount total due'].found).toBe(false);
	// The match lies where the words are drawn: "Total due" starts 72 pt from the left of a
	// 612 x 792 pt page, its baseline 650 pt up, set at 12 pt (Helvetica).
	const { rect, page: p } = found['Total due'];
	const fx = (rect!.x - p!.x) / p!.w;
	const fy = (rect!.y + rect!.h / 2 - p!.y) / p!.h;
	const fw = rect!.w / p!.w;
	expect(Math.abs(fx - 72 / 612)).toBeLessThan(0.01);
	expect(Math.abs(fy - (792 - 650 - 4) / 792)).toBeLessThan(0.01);
	// Helvetica "Total due" at 12 pt is about 52 pt wide.
	expect(Math.abs(fw - 52 / 612)).toBeLessThan(0.012);

	// The layer takes no pointer: a press on a word reaches the tile (drag, select, open).
	const hit = await page.evaluate(() => {
		const ln = document.querySelectorAll('[role=option]')[5].querySelector('.text-layer .ln')!;
		const r = ln.getBoundingClientRect();
		const el = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
		return { inLayer: !!el?.closest('.text-layer'), tile: el?.closest('[role=option]')?.getAttribute('aria-label') ?? null };
	});
	expect(hit.inLayer).toBe(false);
	expect(hit.tile).toMatch(/^Page 6,/);
});

test('the Find bar counts matches, steps through them and closes with Escape', async ({ page }, info) => {
	await open(page);
	await findButton(page).click();
	await expect(field(page)).toBeFocused();
	await field(page).fill('total');
	// The first match is shown at once.
	await expect(count(page)).toHaveText(/^1 of 2( on 2 pages)?$/, { timeout: 30_000 });
	await expect(bar(page).getByRole('status')).toHaveText('1 of 2 matches on 2 pages');
	await expect(page.locator('.find-current [data-testid=find-chip]')).toHaveText('1');
	await expect(page.getByRole('option').nth(0)).toHaveClass(/find-current/);
	await expect(page.locator('[role=option].find-hit')).toHaveCount(2);
	await field(page).press('Enter');
	await expect(count(page)).toHaveText(/^2 of 2/);
	await expect(page.getByRole('option').nth(5)).toHaveClass(/find-current/);
	await expect(page.getByRole('option').nth(5)).toBeInViewport();
	await field(page).press('Shift+Enter');
	await expect(count(page)).toHaveText(/^1 of 2/);

	// The matches are painted with the Custom Highlight API over the layer's text.
	const painted = await page.evaluate(() => ({ all: CSS.highlights.get('find-match')?.size, current: CSS.highlights.get('find-current')?.size, text: [...(CSS.highlights.get('find-current') as unknown as Set<Range>)][0]?.toString() }));
	expect(painted).toEqual({ all: 1, current: 1, text: 'total' });

	// Accents and case do not matter; a phrase within a line matches, across lines it does not.
	await field(page).fill('CREME brulee');
	await expect(count(page)).toHaveText(/^1 of 1/);
	await field(page).fill('amount total due');
	await expect(count(page)).toHaveText('No matches');
	await field(page).fill('');
	await expect(count(page)).toHaveText('');

	await field(page).press('Escape');
	await expect(bar(page)).toBeHidden();
	await expect(page.locator('[role=option].find-hit')).toHaveCount(0);
	expect(await page.evaluate(() => CSS.highlights.has('find-match'))).toBe(false);
	if (!isPhone(info)) await expect(findButton(page)).toBeFocused();
});

test('in the editor the Find bar moves from page to page, and the page has its layer', async ({ page }, info) => {
	await open(page);
	if (isPhone(info)) await page.getByRole('option').nth(0).tap();
	else await page.getByRole('option').nth(0).dblclick();
	await expect(page.getByTestId('editor-page')).toBeVisible();
	// In the header on a desktop, floating over the page area on a phone.
	await page.getByRole('dialog').locator('[data-testid^="find-open"]:visible').click();
	await field(page).fill('invoice');
	await expect(count(page)).toHaveText(/^1 of 2/, { timeout: 30_000 });
	const indicator = page.locator('.editor .indicator');
	await expect(indicator).toHaveText(/^2\s*of\s*8$/);
	await expect(page.getByTestId('editor-page').locator('.text-layer .ln', { hasText: 'See invoice number 102 for details.' })).toHaveCount(1);
	await expect.poll(() => page.evaluate(() => [...(CSS.highlights.get('find-current') as unknown as Set<Range>)].map((r) => r.toString()))).toEqual(['invoice']);
	await field(page).press('Enter');
	await expect(indicator).toHaveText(/^4\s*of\s*8$/);
	await field(page).press('Enter');
	await expect(indicator).toHaveText(/^2\s*of\s*8$/);
	await field(page).press('Escape');
	await expect(bar(page)).toBeHidden();
	// The editor stays open.
	await expect(page.getByTestId('editor-page')).toBeVisible();
});

test('Find is not offered for pictures', async ({ page }) => {
	await page.goto('/');
	await page.locator('input[type=file]').first().setInputFiles(corpus('photo-plain.jpg'));
	await expect(page.getByRole('option')).toHaveCount(1, { timeout: 30_000 });
	await page.waitForTimeout(1500);
	await expect(page.locator('[data-testid^="find-open"]')).toHaveCount(0);
});

test('a document without text: Find is not offered on a desktop; on a phone Find says there is no text', async ({ page }, info) => {
	await open(page, 'find-none.pdf', 2);
	if (!isPhone(info)) {
		await page.waitForTimeout(3000);
		await expect(page.locator('[data-testid^="find-open"]')).toHaveCount(0);
		return;
	}
	await findButton(page).tap();
	await expect(bar(page).getByTestId('find-note')).toHaveText('No searchable text in this document.', { timeout: 30_000 });
	await field(page).press('Escape');
	await expect(page.locator('[data-testid^="find-open"]')).toHaveCount(0);
});
