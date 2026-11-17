// Select text: the editor's default tool on a page with text when a mouse or trackpad is
// the pointer. A drag from a word selects words; Copy (or Ctrl/Cmd+C) puts them on the
// clipboard; nothing is written to the page. On touch screens it is not the default (a
// drag must keep panning and turning pages) but can be picked from More.
import type { Page, TestInfo } from '@playwright/test';
import { test, expect } from './fixtures';
import { chooseTool, moreButton, openEditor, pageBox, stamps, tapPage } from './editor-helpers';

type Box = { x: number; y: number; w: number; h: number };
interface Word {
	text: string;
	box: Box;
	line: number;
}

const isPhone = (info: TestInfo) => info.project.name === 'phone';
const FILE = 'file=hl-text.pdf';

async function pageWords(page: Page, pageIndex: number): Promise<Word[]> {
	return page.evaluate(async (i) => {
		const ed = (window as unknown as { __editor: { engine: { pageText: (s: unknown, i: number) => Promise<{ words: Word[] }> }; store: { state: { sources: unknown[] } } } }).__editor;
		return (await ed.engine.pageText(ed.store.state.sources[0], i)).words;
	}, pageIndex);
}

const word = (ws: Word[], text: string, line?: number) => {
	const w = ws.find((x) => x.text === text && (line === undefined || x.line === line));
	if (!w) throw new Error(`no word ${text}`);
	return w;
};
const inside = (w: Word, fx = 0.5, fy = 0.5): [number, number] => [w.box.x + fx * w.box.w, w.box.y + fy * w.box.h];

/** Press at one page fraction, move to another, release (mouse, or real touch through CDP on the phone). */
async function drag(page: Page, info: TestInfo, from: [number, number], to: [number, number], during?: () => Promise<void>) {
	const b = await pageBox(page);
	const x0 = b.x + from[0] * b.width;
	const y0 = b.y + from[1] * b.height;
	const x1 = b.x + to[0] * b.width;
	const y1 = b.y + to[1] * b.height;
	const steps = 10;
	if (isPhone(info)) {
		const cdp = await page.context().newCDPSession(page);
		const touch = (type: 'touchStart' | 'touchMove' | 'touchEnd', pts: [number, number][]) =>
			cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(([x, y], id) => ({ x, y, id, radiusX: 4, radiusY: 4, force: 1 })) });
		await touch('touchStart', [[x0, y0]]);
		for (let i = 1; i <= steps; i++) await touch('touchMove', [[x0 + ((x1 - x0) * i) / steps, y0 + ((y1 - y0) * i) / steps]]);
		await during?.();
		await touch('touchEnd', []);
	} else {
		await page.mouse.move(x0, y0);
		await page.mouse.down();
		for (let i = 1; i <= steps; i++) await page.mouse.move(x0 + ((x1 - x0) * i) / steps, y0 + ((y1 - y0) * i) / steps);
		await during?.();
		await page.mouse.up();
	}
}

const selectTool = (page: Page) => page.getByRole('toolbar', { name: 'Tools' }).locator('[data-tool="select"]');
const textBar = (page: Page) => page.getByRole('toolbar', { name: 'Selected text' });
const clipboard = (page: Page) => page.evaluate(() => navigator.clipboard.readText());
const clearClipboard = (page: Page) => page.evaluate(() => navigator.clipboard.writeText(''));

test.beforeEach(async ({ context, baseURL }) => {
	await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: new URL(baseURL!).origin });
});

test.describe('desktop', () => {
	test.beforeEach(({}, info) => test.skip(isPhone(info), 'mouse only'));

	test('a page with text opens with Select text on: drag selects, Copy and Ctrl+C copy, nothing is written', async ({ page }, info) => {
		await openEditor(page, `${FILE}&page=1`);
		const ws = await pageWords(page, 0);
		await expect(selectTool(page)).toHaveAttribute('aria-pressed', 'true');
		await expect(selectTool(page)).toHaveText('Select text');
		await drag(page, info, inside(word(ws, 'quick'), 0.6), inside(word(ws, 'lazy'), 0.3), async () => {
			await expect(page.getByTestId('text-selection')).toBeVisible();
		});
		// The selection stays after release, with its bar; the page is unchanged.
		await expect(page.getByTestId('text-selection').locator('span')).toHaveCount(2);
		await expect(textBar(page)).toContainText('7 words');
		expect(await stamps(page)).toHaveLength(0);
		await expect(page.getByTestId('live')).toHaveText(/^Selected 7 words\. Press (Control|Command)\+C to copy\.$/);

		await clearClipboard(page);
		await textBar(page).getByRole('button', { name: 'Copy' }).click();
		await expect(textBar(page).getByRole('button', { name: 'Copied' })).toBeVisible();
		expect(await clipboard(page)).toBe('quick brown fox jumping\nover the lazy');
		await expect(page.getByTestId('live')).toHaveText('Copied 7 words.');

		await clearClipboard(page);
		await page.keyboard.press('ControlOrMeta+C');
		await expect.poll(() => clipboard(page)).toBe('quick brown fox jumping\nover the lazy');
		expect(await stamps(page)).toHaveLength(0);

		// Escape clears the selection, not the tool.
		await page.keyboard.press('Escape');
		await expect(page.getByTestId('text-selection')).toHaveCount(0);
		await expect(textBar(page)).toHaveCount(0);
		await expect(selectTool(page)).toHaveAttribute('aria-pressed', 'true');
	});

	test('double-click selects a word, a click clears it, Ctrl+A selects the page', async ({ page }, info) => {
		await openEditor(page, `${FILE}&page=1`);
		const ws = await pageWords(page, 0);
		await expect(selectTool(page)).toHaveAttribute('aria-pressed', 'true');
		const b = await pageBox(page);
		const [fx, fy] = inside(word(ws, 'fox'));
		await page.mouse.dblclick(b.x + fx * b.width, b.y + fy * b.height);
		await expect(textBar(page)).toContainText('1 word');
		await clearClipboard(page);
		await page.keyboard.press('ControlOrMeta+C');
		await expect.poll(() => clipboard(page)).toBe('fox');
		await tapPage(page, 0.5, 0.95);
		await expect(textBar(page)).toHaveCount(0);
		await page.keyboard.press('ControlOrMeta+A');
		await expect(textBar(page)).toContainText(`${ws.length} words`);
		expect(await stamps(page)).toHaveLength(0);
		// A drag far from any word still turns nothing into a selection.
		await page.keyboard.press('Escape');
		await drag(page, info, [0.3, 0.8], [0.32, 0.9]);
		await expect(textBar(page)).toHaveCount(0);
		await expect(page.getByText('1 of 10')).toBeVisible();
	});

	test('other tools take over and give it back; stamps still move; it can be put away', async ({ page }, info) => {
		await openEditor(page, `${FILE}&page=1`);
		const ws = await pageWords(page, 0);
		await expect(selectTool(page)).toHaveAttribute('aria-pressed', 'true');
		// Highlight replaces it while armed: a drag highlights as before.
		await chooseTool(page, 'Highlight');
		await expect(selectTool(page)).toHaveAttribute('aria-pressed', 'false');
		await drag(page, info, inside(word(ws, 'quick'), 0.6), inside(word(ws, 'fox'), 0.5));
		expect(await stamps(page)).toHaveLength(1);
		await expect(textBar(page)).toHaveCount(0);
		await page.keyboard.press('Escape');
		await expect(selectTool(page)).toHaveAttribute('aria-pressed', 'true');
		// A stamp placed over words moves with a drag; no words are selected.
		await chooseTool(page, 'Check');
		const [cx, cy] = inside(word(ws, 'brown', 0));
		await tapPage(page, cx, cy);
		await page.keyboard.press('Escape');
		await expect(selectTool(page)).toHaveAttribute('aria-pressed', 'true');
		const mark = (await stamps(page)).find((s) => s.kind === 'mark')!;
		const el = page.locator(`[data-stamp="${mark.id}"]`);
		const eb = (await el.boundingBox())!;
		await page.mouse.move(eb.x + eb.width / 2, eb.y + eb.height / 2);
		await page.mouse.down();
		for (let i = 1; i <= 8; i++) await page.mouse.move(eb.x + eb.width / 2, eb.y + eb.height / 2 + i * 10);
		await page.mouse.up();
		const moved = (await stamps(page)).find((s) => s.id === mark.id)!;
		expect(moved.box!.y).toBeGreaterThan(mark.box!.y + 0.05);
		await expect(page.getByTestId('text-selection')).toHaveCount(0);
		// Put away by hand: a drag over words selects nothing, and the choice lasts the visit.
		await page.keyboard.press('Escape');
		await selectTool(page).click();
		await expect(selectTool(page)).toHaveAttribute('aria-pressed', 'false');
		await drag(page, info, inside(word(ws, 'over'), 0.5), inside(word(ws, 'lazy'), 0.5));
		await expect(page.getByTestId('text-selection')).toHaveCount(0);
		await page.keyboard.press('PageDown');
		await expect(page.getByText('2 of 10')).toBeVisible();
		await expect(selectTool(page)).toHaveAttribute('aria-pressed', 'false');
		await selectTool(page).click();
		await expect(selectTool(page)).toHaveAttribute('aria-pressed', 'true');
		await expect(page.getByTestId('editor-note')).toHaveText('Drag across the words to select them, then copy.');
	});

	test('a scan with no text: Select text is not on, and a drag behaves as before', async ({ page }, info) => {
		await openEditor(page, `${FILE}&page=7`);
		// The page's words have been read (none): the tool stays off.
		await expect.poll(async () => (await pageWords(page, 6)).length).toBe(0);
		await expect(selectTool(page)).toHaveAttribute('aria-pressed', 'false');
		await drag(page, info, [0.3, 0.3], [0.32, 0.45]);
		await expect(page.getByTestId('text-selection')).toHaveCount(0);
		expect(await stamps(page, 6)).toHaveLength(0);
		await expect(page.getByText('7 of 10')).toBeVisible();
		await selectTool(page).click();
		await expect(page.getByTestId('editor-note')).toHaveText('This page has no selectable text.');
		// A scan with an invisible text layer (from OCR) has words: they can be selected.
		await page.keyboard.press('PageUp');
		await expect(page.getByText('6 of 10')).toBeVisible();
		await expect(selectTool(page)).toHaveAttribute('aria-pressed', 'true');
		const ws = await pageWords(page, 5);
		const b = await pageBox(page);
		const [fx, fy] = inside(word(ws, 'words'));
		await page.mouse.dblclick(b.x + fx * b.width, b.y + fy * b.height);
		await expect(textBar(page)).toContainText('1 word');
	});
});

test.describe('phone', () => {
	test.beforeEach(({}, info) => test.skip(!isPhone(info), 'touch only'));

	test('not the default on touch: a drag over words selects nothing; picked from More, it selects and copies', async ({ page }, info) => {
		await openEditor(page, `${FILE}&page=1`);
		const ws = await pageWords(page, 0);
		await expect(moreButton(page)).toHaveAccessibleName('More tools');
		// A swipe across the words at fit turns the page, as before.
		await drag(page, info, inside(word(ws, 'jumping'), 0.9), [0.05, word(ws, 'jumping').box.y]);
		await expect(page.getByText('2 of 10')).toBeVisible();
		await expect(page.getByTestId('text-selection')).toHaveCount(0);
		await page.keyboard.press('PageUp');
		await expect(page.getByText('1 of 10')).toBeVisible();

		await chooseTool(page, 'Select text');
		await expect(moreButton(page)).toHaveAccessibleName('Select text, armed. More tools');
		await drag(page, info, inside(word(ws, 'quick'), 0.6), inside(word(ws, 'lazy'), 0.3));
		await expect(textBar(page)).toContainText('7 words');
		expect(await stamps(page)).toHaveLength(0);
		await clearClipboard(page);
		await textBar(page).getByRole('button', { name: 'Copy' }).click();
		await expect.poll(() => clipboard(page)).toBe('quick brown fox jumping\nover the lazy');
	});
});
