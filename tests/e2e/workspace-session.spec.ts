/**
 * Saved work, Home and projects: several pieces of work kept on this device (IndexedDB),
 * one open at a time, Home always one tap away. Runs on desktop and phone.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as mupdf from 'mupdf';
import type { Page, TestInfo } from '@playwright/test';
import { test, expect } from './fixtures';
import { chooseTool, highlightShape, makeSignature, pageBox, tapPage } from './editor-helpers';

const corpus = (name: string) => fileURLToPath(new URL(`../corpus/files/${name}`, import.meta.url));
const options = (page: Page) => page.getByRole('option');
const line = (page: Page) => page.getByTestId('save-line');
const work = (page: Page) => page.getByRole('region', { name: 'Your work' });
const cards = (page: Page) => page.locator('[data-card]');
const card = (page: Page, name: string) => page.locator('[data-card]').filter({ hasText: name });
const homeBtn = (page: Page) => page.getByRole('button', { name: 'Home', exact: true });
const toasts = (page: Page) => page.getByRole('region', { name: 'Notifications' });
const headline = (page: Page) => page.getByRole('heading', { name: 'Combine, sign and fix PDFs' });
const SAVED = 'Saved on this device only.';
const isPhone = (info: TestInfo) => info.project.name === 'phone';

async function addFiles(page: Page, ...names: string[]) {
	await page.locator('input[type=file]').first().setInputFiles(names.map(corpus));
}

async function labels(page: Page): Promise<string[]> {
	return options(page).evaluateAll((els) => els.map((e) => e.getAttribute('aria-label') ?? ''));
}

interface Stored {
	records: Record<string, unknown>[];
	blobs: number;
	thumbs: number;
}

/** The saved records, stored files and pictures, read straight from IndexedDB. */
async function stored(page: Page): Promise<Stored> {
	return page.evaluate(
		() =>
			new Promise((resolve, reject) => {
				const r = indexedDB.open('pdf-workspace-session');
				r.onerror = () => reject(r.error);
				r.onsuccess = () => {
					const db = r.result;
					if (!db.objectStoreNames.contains('projects')) {
						db.close();
						return resolve({ records: [], blobs: 0, thumbs: 0 });
					}
					const tx = db.transaction(['projects', 'blobs', 'thumbs']);
					const recs = tx.objectStore('projects').getAll();
					const n = tx.objectStore('blobs').count();
					const t = tx.objectStore('thumbs').count();
					tx.oncomplete = () => {
						db.close();
						resolve({ records: recs.result as Record<string, unknown>[], blobs: n.result, thumbs: t.result });
					};
				};
			})
	);
}

const pagesOf = (rec: Record<string, unknown>) => (rec.pages as unknown[]).length;
const namesOf = (rec: Record<string, unknown>) => (rec.sources as { name: string }[]).map((s) => s.name).join(',');

/** Wait until a saved record holds `name` with `pages` pages and nothing is pending. */
async function waitSaved(page: Page, pages: number, name?: string) {
	await expect(line(page)).toContainText(SAVED);
	await expect
		.poll(async () => (await stored(page)).records.some((r) => pagesOf(r) === pages && (!name || namesOf(r).includes(name))), { timeout: 15_000 })
		.toBe(true);
	await page.waitForTimeout(700);
}

async function goHome(page: Page) {
	await homeBtn(page).click();
	await expect(work(page)).toBeVisible();
	await expect(options(page)).toHaveCount(0);
}

/** Real touch drag through CDP (phone), or the mouse (desktop), in page fractions. */
async function dragOnPage(page: Page, info: TestInfo, from: [number, number], to: [number, number]) {
	const b = await pageBox(page);
	const pt = (f: [number, number]) => ({ x: b.x + f[0] * b.width, y: b.y + f[1] * b.height });
	const a = pt(from);
	const z = pt(to);
	if (isPhone(info)) {
		const cdp = await page.context().newCDPSession(page);
		await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...a, id: 1 }] });
		for (let i = 1; i <= 8; i++) {
			await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: a.x + ((z.x - a.x) * i) / 8, y: a.y + ((z.y - a.y) * i) / 8, id: 1 }] });
		}
		await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
		await cdp.detach();
	} else {
		await page.mouse.move(a.x, a.y);
		await page.mouse.down();
		for (let i = 1; i <= 8; i++) await page.mouse.move(a.x + ((z.x - a.x) * i) / 8, a.y + ((z.y - a.y) * i) / 8);
		await page.mouse.up();
	}
}

async function exportAll(page: Page): Promise<Uint8Array> {
	await page.getByRole('button', { name: 'Export', exact: true }).click();
	const dialog = page.getByRole('dialog', { name: 'Export PDF' });
	await dialog.getByRole('button', { name: 'Export', exact: true }).click();
	const done = page.getByRole('dialog', { name: 'Your file is ready' });
	await expect(done.getByText(/^Checked: \d+ pages, opens cleanly\.$/)).toBeVisible({ timeout: 60_000 });
	const [download] = await Promise.all([page.waitForEvent('download'), done.getByRole('button', { name: 'Download' }).click()]);
	const bytes = new Uint8Array(readFileSync((await download.path())!));
	await done.getByRole('button', { name: /^(Done|Close)$/ }).first().click();
	await expect(done).toBeHidden();
	return bytes;
}

/** Every page rendered by MuPDF in Node, with its size: pixel for pixel. */
function renders(bytes: Uint8Array): string[] {
	const doc = new mupdf.PDFDocument(bytes.slice());
	try {
		const out: string[] = [];
		for (let i = 0; i < doc.countPages(); i++) {
			const p = doc.loadPage(i);
			const pix = p.toPixmap(mupdf.Matrix.scale(1, 1), mupdf.ColorSpace.DeviceRGB, false, true);
			out.push(`${p.getBounds().join(',')}:${Buffer.from(pix.getPixels()).toString('base64')}`);
			pix.destroy();
		}
		return out;
	} finally {
		doc.destroy();
	}
}

/**
 * Search every place the page can keep data (all IndexedDB databases, values and
 * blobs; localStorage; sessionStorage; OPFS) for a string, as UTF-8, UTF-16 and Latin-1.
 */
async function storageContains(page: Page, needle: string): Promise<string[]> {
	return page.evaluate(async (needle) => {
		const hits: string[] = [];
		const forms: Uint8Array[] = [new TextEncoder().encode(needle)];
		const u16 = new Uint8Array(needle.length * 2);
		for (let i = 0; i < needle.length; i++) {
			u16[2 * i] = needle.charCodeAt(i) & 0xff;
			u16[2 * i + 1] = needle.charCodeAt(i) >> 8;
		}
		forms.push(u16, Uint8Array.from(needle, (c) => c.charCodeAt(0) & 0xff));
		const has = (b: Uint8Array) =>
			forms.some((f) => {
				outer: for (let i = 0; i + f.length <= b.length; i++) {
					for (let j = 0; j < f.length; j++) if (b[i + j] !== f[j]) continue outer;
					return true;
				}
				return false;
			});
		const visit = async (v: unknown, where: string): Promise<void> => {
			if (v == null) return;
			if (typeof v === 'string') {
				if (v.includes(needle)) hits.push(where);
			} else if (v instanceof Blob) {
				if (has(new Uint8Array(await v.arrayBuffer()))) hits.push(`${where} (blob)`);
			} else if (v instanceof ArrayBuffer) {
				if (has(new Uint8Array(v))) hits.push(where);
			} else if (ArrayBuffer.isView(v)) {
				if (has(new Uint8Array(v.buffer, v.byteOffset, v.byteLength))) hits.push(where);
			} else if (typeof v === 'object') {
				for (const [k, x] of Object.entries(v as object)) {
					if (k.includes(needle)) hits.push(`${where}.${k} (key)`);
					await visit(x, `${where}.${k}`);
				}
			}
		};
		for (const info of await indexedDB.databases()) {
			const db = await new Promise<IDBDatabase>((res, rej) => {
				const r = indexedDB.open(info.name!);
				r.onsuccess = () => res(r.result);
				r.onerror = () => rej(r.error);
			});
			for (const name of db.objectStoreNames) {
				const all = await new Promise<unknown[]>((res) => {
					const r = db.transaction(name).objectStore(name).getAll();
					r.onsuccess = () => res(r.result);
				});
				await visit(all, `idb:${info.name}/${name}`);
			}
			db.close();
		}
		for (const [k, s] of [['local', localStorage], ['session', sessionStorage]] as const) {
			for (let i = 0; i < s.length; i++) {
				const key = s.key(i)!;
				await visit(`${key}=${s.getItem(key)}`, `${k}Storage`);
			}
		}
		try {
			const walk = async (dir: FileSystemDirectoryHandle, path: string): Promise<void> => {
				for await (const [name, h] of (dir as unknown as { entries(): AsyncIterable<[string, FileSystemHandle]> }).entries()) {
					if (h.kind === 'file') await visit(await (h as FileSystemFileHandle).getFile(), `opfs:${path}/${name}`);
					else await walk(h as FileSystemDirectoryHandle, `${path}/${name}`);
				}
			};
			await walk(await navigator.storage.getDirectory(), '');
		} catch {
			// No OPFS here.
		}
		return hits;
	}, needle);
}

test('work survives a reload: Home shows its card; the card brings back the same pages and the same export', async ({ page }, info) => {
	test.setTimeout(180_000);
	const dialogs: string[] = [];
	page.on('dialog', (d) => {
		dialogs.push(d.type());
		void d.dismiss();
	});
	await page.goto('/');
	await addFiles(page, 'multi.pdf', 'rotated.pdf');
	await expect(options(page)).toHaveCount(12, { timeout: 30_000 });

	// Reorder and rotate with the keyboard (same on both layouts).
	await options(page).first().focus();
	await page.keyboard.press(' ');
	await page.keyboard.press('Alt+ArrowRight');
	await page.keyboard.press('Alt+ArrowRight');
	await page.keyboard.press('r');
	await page.keyboard.press('Escape');

	// Text, signature, highlight and a check on page 2.
	await options(page).nth(1).focus();
	await page.keyboard.press('Enter');
	const editor = page.getByRole('dialog', { name: /^Edit page 2 of 12/ });
	await expect(editor).toBeVisible();
	await expect(page.getByTestId('editor-page')).toBeVisible();
	await page.waitForFunction(() => {
		const c = document.querySelector<HTMLCanvasElement>('[data-testid=editor-page] canvas');
		return !!c && c.width > 0;
	});
	await chooseTool(page, 'Text');
	await tapPage(page, 0.15, 0.75);
	await expect(page.getByRole('textbox', { name: 'Text on the page' })).toBeFocused();
	await page.keyboard.type('Saved 12 Nov');
	await page.keyboard.press('Escape');
	await makeSignature(page, { save: false });
	await tapPage(page, 0.4, 0.4);
	await page.keyboard.press('Escape');
	await chooseTool(page, 'Highlight');
	await highlightShape(page, 'Box');
	await dragOnPage(page, info, [0.2, 0.55], [0.6, 0.6]);
	await page.keyboard.press('Escape');
	await chooseTool(page, 'Check');
	await tapPage(page, 0.8, 0.15);
	await page.keyboard.press('Escape');
	await editor.getByRole('button', { name: 'Done', exact: true }).click();
	await expect(editor).toBeHidden();

	const before = await labels(page);
	expect(before[2]).toContain('multi.pdf');
	expect(before[2]).toMatch(/rotated 90°/);
	const exported = await exportAll(page);
	await waitSaved(page, 12);
	const rec = (await stored(page)).records[0];
	const stamps = (rec.pages as { stamps: { kind: string; mark?: string }[] }[]).flatMap((p) => p.stamps.map((s) => s.mark ?? s.kind));
	expect(stamps.sort()).toEqual(['check', 'highlight', 'image', 'text']);
	// Its first page picture is stored too.
	await expect.poll(async () => (await stored(page)).thumbs).toBe(1);

	// Saved work: leaving does not ask. A reload lands on Home, nothing opened by itself.
	await page.reload();
	expect(dialogs).toEqual([]);
	await expect(work(page)).toBeVisible();
	await expect(cards(page)).toHaveCount(1);
	await expect(cards(page).first()).toHaveAccessibleName('multi.pdf, 2 files, 12 pages, edited just now');
	await expect(cards(page).first().locator('img')).toBeVisible();
	await expect(options(page)).toHaveCount(0);
	await cards(page).first().click();
	await expect(options(page)).toHaveCount(12, { timeout: 30_000 });
	expect(await labels(page)).toEqual(before);
	await expect(line(page)).toContainText(SAVED);

	// Undo history is not kept.
	await expect(page.getByRole('button', { name: /^Undo/ })).toBeDisabled();

	// The same export as before the reload: same pages, same stamps, pixel for pixel.
	const again = await exportAll(page);
	const a = renders(exported);
	const b = renders(again);
	expect(b.length).toBe(12);
	expect(b).toEqual(a);
});

test('two pieces of work are kept and switched; Home and the Back button move between Home and the work', async ({ page }, info) => {
	test.setTimeout(120_000);
	await page.goto('/');
	await expect(headline(page)).toBeVisible();
	await expect(work(page)).toHaveCount(0);
	await addFiles(page, 'multi.pdf');
	await expect(options(page)).toHaveCount(6, { timeout: 30_000 });
	await waitSaved(page, 6, 'multi.pdf');
	await options(page).nth(2).focus();
	await page.keyboard.press('r');
	await waitSaved(page, 6, 'multi.pdf');

	// Home: the open work is the first card, marked open; the grid is gone, nothing is lost.
	await goHome(page);
	await expect(cards(page)).toHaveCount(1);
	await expect(card(page, 'multi.pdf')).toContainText('Open');
	await expect(card(page, 'multi.pdf')).toBeFocused();
	// Back to it: instant, same pages.
	await card(page, 'multi.pdf').click();
	await expect(options(page)).toHaveCount(6);
	expect((await labels(page))[2]).toMatch(/rotated 90°/);

	// The Back button goes Home; Forward comes back.
	await page.goBack();
	await expect(work(page)).toBeVisible();
	await page.goForward();
	await expect(options(page)).toHaveCount(6);

	// New work from Home keeps the first piece as a card.
	await goHome(page);
	await expect(page.getByText('This starts new work. Your other work stays saved.')).toBeVisible();
	await addFiles(page, 'sizes.pdf');
	await expect(options(page)).toHaveCount(6, { timeout: 30_000 });
	expect((await labels(page)).every((l) => l.includes('sizes.pdf'))).toBe(true);
	await waitSaved(page, 6, 'sizes.pdf');
	expect((await stored(page)).records).toHaveLength(2);

	// Back from the new work: Home with both, the open one first.
	await page.goBack();
	await expect(cards(page)).toHaveCount(2);
	await expect(cards(page).nth(0)).toContainText('sizes.pdf');
	await expect(cards(page).nth(0)).toContainText('Open');
	await expect(cards(page).nth(1)).toContainText('multi.pdf');

	// Open the other one: the open work is saved and unloaded, the other comes in.
	await cards(page).nth(1).click();
	await expect(options(page)).toHaveCount(6, { timeout: 30_000 });
	expect((await labels(page)).every((l) => l.includes('multi.pdf'))).toBe(true);
	expect((await labels(page))[2]).toMatch(/rotated 90°/);
	// The wordmark goes Home too (on phones the Home button stands in for it in the top bar).
	if (isPhone(info)) await expect(page.getByRole('link', { name: 'pdf.garrettholmes.com, home' })).toBeHidden();
	await (isPhone(info) ? homeBtn(page) : page.getByRole('link', { name: 'pdf.garrettholmes.com, home' })).click();
	await expect(cards(page)).toHaveCount(2);
	await expect(cards(page).nth(0)).toContainText('multi.pdf');
	await expect(cards(page).nth(1)).toContainText('sizes.pdf');
	await cards(page).nth(1).click();
	await expect(options(page)).toHaveCount(6, { timeout: 30_000 });
	expect((await labels(page)).every((l) => l.includes('sizes.pdf'))).toBe(true);
	// Still on the site after Back: Home.
	await page.goBack();
	await expect(work(page)).toBeVisible();
	expect(new URL(page.url()).pathname).toBe('/');
});

test('forget one piece of work, then all of it', async ({ page }) => {
	test.setTimeout(90_000);
	await page.goto('/');
	await addFiles(page, 'multi.pdf');
	await waitSaved(page, 6, 'multi.pdf');
	await goHome(page);
	await addFiles(page, 'sizes.pdf');
	await waitSaved(page, 6, 'sizes.pdf');
	await goHome(page);
	await addFiles(page, 'rotated.pdf');
	await waitSaved(page, 6, 'rotated.pdf');
	await goHome(page);
	await expect(cards(page)).toHaveCount(3);
	expect((await stored(page)).blobs).toBe(3);

	// Forget one that is not open: asks first; Cancel keeps it.
	await page.getByRole('button', { name: 'Forget multi.pdf' }).click();
	const confirm = page.getByRole('dialog', { name: 'Forget this work?' });
	await expect(confirm).toContainText('“multi.pdf” (6 pages) will be deleted from this device. This cannot be undone.');
	await expect(confirm.getByRole('button', { name: 'Cancel' })).toBeFocused();
	await confirm.getByRole('button', { name: 'Cancel' }).click();
	await expect(cards(page)).toHaveCount(3);
	await page.getByRole('button', { name: 'Forget multi.pdf' }).click();
	await confirm.getByRole('button', { name: 'Forget', exact: true }).click();
	await expect(toasts(page).getByText('Forgot “multi.pdf”.')).toBeVisible();
	await expect(cards(page)).toHaveCount(2);
	await expect.poll(async () => (await stored(page)).records.map(namesOf).sort()).toEqual(['rotated.pdf', 'sizes.pdf']);
	await expect.poll(async () => (await stored(page)).blobs).toBe(2);

	// Forget the open one: it is closed too.
	await page.getByRole('button', { name: 'Forget rotated.pdf' }).click();
	await expect(confirm).toContainText('will be deleted from this device and closed');
	await confirm.getByRole('button', { name: 'Forget', exact: true }).click();
	await expect(cards(page)).toHaveCount(1);
	await expect(page.locator('[data-card][data-open]')).toHaveCount(0);

	// Forget all.
	await work(page).getByRole('button', { name: 'Forget all my work' }).click();
	const all = page.getByRole('dialog', { name: 'Forget all your work?' });
	await all.getByRole('button', { name: 'Forget all' }).click();
	await expect(toasts(page).getByText('Your work was removed from this device.')).toBeVisible();
	await expect(work(page)).toHaveCount(0);
	await expect.poll(() => stored(page)).toEqual({ records: [], blobs: 0, thumbs: 0 });
	await page.reload();
	await expect(headline(page)).toBeVisible();
	await page.waitForTimeout(500);
	await expect(work(page)).toHaveCount(0);
});

test('Forget all my work from inside the work closes it and goes Home', async ({ page }) => {
	await page.goto('/');
	await addFiles(page, 'multi.pdf');
	await waitSaved(page, 6);
	await line(page).getByRole('button', { name: 'Settings' }).click();
	const dlg = page.getByRole('dialog', { name: 'Your work on this device' });
	await expect(dlg).toContainText(SAVED);
	await dlg.getByRole('button', { name: 'Forget all my work' }).click();
	await page.getByRole('dialog', { name: 'Forget all your work?' }).getByRole('button', { name: 'Forget all' }).click();
	await expect(toasts(page).getByText('Your work was removed from this device.')).toBeVisible();
	await expect(options(page)).toHaveCount(0);
	await expect(headline(page)).toBeVisible();
	expect(await stored(page)).toEqual({ records: [], blobs: 0, thumbs: 0 });
});

test('saving off: the work is kept in this tab only, not saved; new work asks before closing it', async ({ page }) => {
	await page.goto('/');
	await addFiles(page, 'multi.pdf');
	await waitSaved(page, 6);
	await line(page).getByRole('button', { name: 'Settings' }).click();
	const dlg = page.getByRole('dialog', { name: 'Your work on this device' });
	const sw = dlg.getByRole('switch', { name: 'Keep my work on this device' });
	await expect(sw).toBeChecked();
	await sw.click();
	await expect(sw).not.toBeChecked();
	await expect(dlg).toContainText('This work is not being saved. Keeping work on this device is off.');
	await dlg.getByRole('button', { name: 'Close' }).last().click();
	await expect(line(page)).toContainText('Keeping work on this device is off.');
	await expect.poll(() => stored(page)).toEqual({ records: [], blobs: 0, thumbs: 0 });
	expect(await page.evaluate(() => localStorage.getItem('pdf-workspace.keep-work'))).toBe('0');

	// Home: one card, this tab only, not saved.
	await goHome(page);
	await expect(cards(page)).toHaveCount(1);
	await expect(card(page, 'multi.pdf')).toContainText('Not saved');
	await expect(work(page)).toContainText('Not kept on this device: keeping work is off.');
	await expect(page.getByText('This starts new work. The work that is open is not saved, so it will be closed.')).toBeVisible();
	// New work asks first; Cancel keeps the open work.
	await addFiles(page, 'sizes.pdf');
	const ask = page.getByRole('dialog', { name: 'Start new work?' });
	await expect(ask).toBeVisible();
	await ask.getByRole('button', { name: 'Cancel' }).click();
	await expect(cards(page)).toHaveCount(1);
	await card(page, 'multi.pdf').click();
	await expect(options(page)).toHaveCount(6);
	await goHome(page);
	await addFiles(page, 'sizes.pdf');
	await ask.getByRole('button', { name: 'Start new work' }).click();
	await expect(options(page)).toHaveCount(6, { timeout: 30_000 });
	expect((await labels(page)).every((l) => l.includes('sizes.pdf'))).toBe(true);
	await page.waitForTimeout(1000);
	expect(await stored(page)).toEqual({ records: [], blobs: 0, thumbs: 0 });
	await goHome(page);
	await expect(cards(page)).toHaveCount(1);

	// Remembered across a reload; on again saves what is open.
	page.on('dialog', (d) => void d.accept());
	await page.reload();
	await expect(headline(page)).toBeVisible();
	await addFiles(page, 'rotated.pdf');
	await expect(options(page)).toHaveCount(6, { timeout: 30_000 });
	await expect(line(page)).toContainText('Keeping work on this device is off.');
	await line(page).getByRole('button', { name: 'Settings' }).click();
	await sw.click();
	await expect(sw).toBeChecked();
	await dlg.getByRole('button', { name: 'Close' }).last().click();
	await waitSaved(page, 6, 'rotated.pdf');
});

test('a password-protected file: kept encrypted, the password asked again when its card is opened, never stored', async ({ page }) => {
	test.setTimeout(90_000);
	const password = 'pässwörd';
	await page.goto('/');
	await addFiles(page, 'enc-aes-256-unicode.pdf', 'multi.pdf');
	const pw = page.getByRole('dialog', { name: 'This file has a password' });
	await expect(pw).toBeVisible({ timeout: 30_000 });
	await pw.getByLabel('Password', { exact: true }).fill(password);
	await pw.getByRole('button', { name: 'Open' }).click();
	await expect(options(page)).toHaveCount(8, { timeout: 30_000 });
	await waitSaved(page, 8);
	const rec = (await stored(page)).records[0];
	const enc = (rec.sources as { name: string; stored: string; needsPassword: boolean; size: number }[]).find((s) => s.name === 'enc-aes-256-unicode.pdf')!;
	expect(enc.stored).toBe('original');
	expect(enc.needsPassword).toBe(true);
	// Stored as given: the same bytes as the file on disk.
	expect(enc.size).toBe(readFileSync(corpus('enc-aes-256-unicode.pdf')).length);
	expect(await storageContains(page, password)).toEqual([]);
	const before = await labels(page);

	await page.reload();
	await expect(cards(page).first()).toContainText('enc-aes-256-unicode.pdf');
	await expect(cards(page).first()).toHaveAccessibleName(/asks for its password/);
	await cards(page).first().click();
	await expect(pw).toBeVisible();
	await expect(pw).toContainText('enc-aes-256-unicode.pdf');
	// A wrong password, then the right one.
	await pw.getByLabel('Password', { exact: true }).fill('wrong');
	await pw.getByRole('button', { name: 'Open' }).click();
	await expect(pw.getByText('That password did not open the file. Check it and try again.')).toBeVisible();
	await pw.getByLabel('Password', { exact: true }).fill(password);
	await pw.getByRole('button', { name: 'Open' }).click();
	await expect(options(page)).toHaveCount(8, { timeout: 30_000 });
	expect(await labels(page)).toEqual(before);
	await page.waitForTimeout(800);
	expect(await storageContains(page, password)).toEqual([]);

	// Skipping the protected file opens the rest and leaves a consistent piece of work.
	await page.reload();
	await cards(page).first().click();
	await pw.getByRole('button', { name: 'Skip this file' }).click();
	await expect(options(page)).toHaveCount(6, { timeout: 30_000 });
	await expect(toasts(page).getByText('Opened 6 pages. 1 file with a password was left out.')).toBeVisible();
	expect((await labels(page)).every((l) => l.includes('multi.pdf'))).toBe(true);
	await waitSaved(page, 6);
	expect(await storageContains(page, password)).toEqual([]);
});

test('skipping the password of the only file opens nothing; the work stays saved', async ({ page }) => {
	await page.goto('/');
	await addFiles(page, 'enc-aes-256-unicode.pdf');
	const pw = page.getByRole('dialog', { name: 'This file has a password' });
	await pw.getByLabel('Password', { exact: true }).fill('pässwörd');
	await pw.getByRole('button', { name: 'Open' }).click();
	await expect(options(page)).toHaveCount(2, { timeout: 30_000 });
	await waitSaved(page, 2);
	await page.reload();
	await cards(page).first().click();
	await pw.getByRole('button', { name: 'Skip this file' }).click();
	await expect(toasts(page).getByText('Nothing was opened. That work is still saved.')).toBeVisible();
	await expect(cards(page)).toHaveCount(1);
	await expect(options(page)).toHaveCount(0);
	expect((await stored(page)).records).toHaveLength(1);
});

test('two tabs: work open in one tab is marked in the other and is never opened twice', async ({ page, context }) => {
	test.setTimeout(90_000);
	await page.goto('/');
	await addFiles(page, 'multi.pdf');
	await waitSaved(page, 6, 'multi.pdf');

	const second = await context.newPage();
	await second.goto('/');
	await expect(cards(second)).toHaveCount(1);
	await expect(card(second, 'multi.pdf')).toContainText('Open in another tab');
	await expect(second.getByRole('button', { name: 'Forget multi.pdf' })).toHaveCount(0);
	await card(second, 'multi.pdf').click();
	await expect(toasts(second).getByText('That work is open in another tab. Close it there to open it here.')).toBeVisible();
	await expect(options(second)).toHaveCount(0);

	// The second tab's own work is saved beside it, and the first tab sees it.
	await addFiles(second, 'sizes.pdf');
	await expect(options(second)).toHaveCount(6, { timeout: 30_000 });
	await waitSaved(second, 6, 'sizes.pdf');
	expect((await stored(page)).records).toHaveLength(2);
	await goHome(page);
	await expect(cards(page)).toHaveCount(2);
	await expect(card(page, 'sizes.pdf')).toContainText('Open in another tab');

	// The first tab closes: the second may open its work now.
	await page.close();
	await goHome(second);
	await expect(card(second, 'multi.pdf')).not.toContainText('Open in another tab', { timeout: 10_000 });
	await card(second, 'multi.pdf').click();
	await expect(options(second)).toHaveCount(6, { timeout: 30_000 });
	expect((await labels(second)).every((l) => l.includes('multi.pdf'))).toBe(true);
	await second.close();
});

test('the work saved by the version before (one saved job) becomes the first card', async ({ page }) => {
	const bytes = readFileSync(corpus('multi.pdf'));
	const doc = new mupdf.PDFDocument(bytes.slice());
	const sizes = Array.from({ length: doc.countPages() }, (_, i) => {
		const b = doc.loadPage(i).getBounds();
		return { width: b[2] - b[0], height: b[3] - b[1] };
	});
	doc.destroy();
	// A page that does not run the app lays the database out as version 1 did.
	await page.goto('/privacy');
	await page.evaluate(
		async ({ bytes, sizes }) => {
			const data = new Uint8Array(bytes);
			const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', data))].map((b) => b.toString(16).padStart(2, '0')).join('');
			const record = {
				schema: 4,
				writer: 'old-tab',
				rev: 'r1',
				savedAt: Date.now() - 3600_000,
				app: 'old',
				clean: false,
				sources: [{ id: 's1', name: 'old-job.pdf', kind: 'pdf', pages: sizes, originalSize: data.length, wasEncrypted: false, notes: [], hash, size: data.length, stored: 'normalized', needsPassword: false }],
				pages: sizes.map((_, i) => ({ id: `pg${i}`, sourceId: 's1', pageIndex: i, rotation: i === 1 ? 90 : 0, stamps: [] })),
				assets: [],
				formValues: {},
				exportForm: {}
			};
			await new Promise<void>((resolve, reject) => {
				const r = indexedDB.open('pdf-workspace-session', 1);
				r.onupgradeneeded = () => {
					r.result.createObjectStore('session');
					r.result.createObjectStore('blobs', { keyPath: 'hash' });
				};
				r.onerror = () => reject(r.error);
				r.onsuccess = () => {
					const db = r.result;
					const tx = db.transaction(['session', 'blobs'], 'readwrite');
					tx.objectStore('session').put(record, 'current');
					tx.objectStore('blobs').put({ hash, size: data.length, blob: new Blob([data]) });
					tx.oncomplete = () => (db.close(), resolve());
				};
			});
		},
		{ bytes: [...bytes], sizes }
	);
	await page.goto('/');
	await expect(cards(page)).toHaveCount(1);
	await expect(cards(page).first()).toHaveAccessibleName('old-job.pdf, 6 pages, edited 1 hour ago');
	await cards(page).first().click();
	await expect(options(page)).toHaveCount(6, { timeout: 30_000 });
	expect((await labels(page))[1]).toMatch(/rotated 90°/);
	// Moved, not copied: version 1's record is gone and the work is saved as a project.
	const left = await page.evaluate(
		() =>
			new Promise<number>((resolve) => {
				const r = indexedDB.open('pdf-workspace-session');
				r.onsuccess = () => {
					const db = r.result;
					const c = db.transaction('session').objectStore('session').count();
					c.onsuccess = () => (db.close(), resolve(c.result));
				};
			})
	);
	expect(left).toBe(0);
	expect((await stored(page)).records.map(namesOf)).toEqual(['old-job.pdf']);
});

test('no room: says so plainly, deletes nothing by itself, and offers to forget other work', async ({ page, guard }) => {
	test.setTimeout(90_000);
	guard.allowConsoleErrors();
	// Simulate a full device: storing a file fails as browsers fail it, while window.__full is set.
	await page.addInitScript(() => {
		const put = IDBObjectStore.prototype.put;
		IDBObjectStore.prototype.put = function (this: IDBObjectStore, ...args: Parameters<typeof put>) {
			if ((window as unknown as { __full?: boolean }).__full && this.name === 'blobs') throw new DOMException('The quota has been exceeded.', 'QuotaExceededError');
			return put.apply(this, args);
		} as typeof put;
	});
	await page.goto('/');
	await addFiles(page, 'multi.pdf');
	await waitSaved(page, 6, 'multi.pdf');
	await goHome(page);
	await page.evaluate(() => ((window as unknown as { __full: boolean }).__full = true));
	await addFiles(page, 'sizes.pdf');
	await expect(options(page)).toHaveCount(6, { timeout: 30_000 });
	await expect(line(page)).toContainText('This work is not being saved. There is not enough room on this device.');
	expect((await stored(page)).records.map(namesOf)).toEqual(['multi.pdf']);
	// Home says it too.
	await goHome(page);
	await expect(card(page, 'sizes.pdf')).toContainText('Not saved');
	await expect(work(page)).toContainText('There is not enough room on this device.');
	await card(page, 'sizes.pdf').click();

	await line(page).getByRole('button', { name: 'Make room' }).click();
	const room = page.getByRole('dialog', { name: 'Make room for this work' });
	await expect(room).toContainText('multi.pdf');
	await expect(room).toContainText('6 pages');
	// Room is made by forgetting the older work.
	await page.evaluate(() => ((window as unknown as { __full: boolean }).__full = false));
	await room.getByRole('button', { name: 'Forget multi.pdf' }).click();
	await expect(toasts(page).getByText('Your work is saved on this device again.')).toBeVisible({ timeout: 15_000 });
	await expect(line(page)).toContainText(SAVED);
	await expect.poll(async () => (await stored(page)).records.map(namesOf)).toEqual(['sizes.pdf']);
});

test('storage blocked: the app still works, says the work is not saved, and leaving asks', async ({ page, guard }) => {
	await page.addInitScript(() => {
		const blocked = () => {
			throw new DOMException('The user denied permission to access the database.', 'SecurityError');
		};
		Object.defineProperty(IDBFactory.prototype, 'open', { value: blocked });
	});
	guard.allowConsoleErrors();
	await page.goto('/');
	await addFiles(page, 'multi.pdf');
	await expect(options(page)).toHaveCount(6, { timeout: 30_000 });
	await expect(line(page)).toContainText('This work is not being saved. This browser does not allow it here.');
	// The leave warning is still there (a real click first: browsers ask only after one).
	await options(page).first().click();
	const dialog = page.waitForEvent('dialog');
	await page.close({ runBeforeUnload: true });
	const d = await dialog;
	expect(d.type()).toBe('beforeunload');
	await d.dismiss();
});

test('work last changed more than 7 days ago is gone', async ({ page }) => {
	await page.goto('/');
	await addFiles(page, 'multi.pdf');
	await waitSaved(page, 6);
	// Age it by 8 days.
	await page.evaluate(
		() =>
			new Promise<void>((resolve) => {
				const r = indexedDB.open('pdf-workspace-session');
				r.onsuccess = () => {
					const db = r.result;
					const tx = db.transaction('projects', 'readwrite');
					const s = tx.objectStore('projects');
					const c = s.openCursor();
					c.onsuccess = () => {
						const cur = c.result;
						if (!cur) return;
						cur.update({ ...cur.value, savedAt: cur.value.savedAt - 8 * 86400_000 });
						cur.continue();
					};
					tx.oncomplete = () => (db.close(), resolve());
				};
			})
	);
	// Leave without saving again (the old record must be what the next visit sees).
	await page.goto('about:blank');
	await page.goto('/');
	await expect(headline(page)).toBeVisible();
	await expect.poll(() => stored(page)).toEqual({ records: [], blobs: 0, thumbs: 0 });
	await expect(work(page)).toHaveCount(0);
});
