/**
 * The OCR cache (workspace/ocr-cache.ts): no scanned page is read twice. Pages the editor
 * read in the background are not read by the export; the readings are kept with saved
 * work, so after a reload the same export reads nothing (the OCR engine is not even
 * loaded); forgetting the work deletes them. And the session database's upgrade to
 * version 3 (the `ocr` store) keeps work saved by version 2. Desktop only (the option and
 * the background reading are desktop only).
 */
import { fileURLToPath } from 'node:url';
import type { Page } from '@playwright/test';
import { test, expect } from './fixtures';
import { openMore } from './export-helpers';

const corpus = (name: string) => fileURLToPath(new URL(`../corpus/files/${name}`, import.meta.url));
const OPTION = 'Make scanned pages searchable';
const options = (page: Page) => page.getByRole('option');
const cards = (page: Page) => page.locator('[data-card]');

/** Rows of the `ocr` store (null when the store does not exist), and the database version. */
async function ocrRows(page: Page): Promise<{ version: number; rows: number | null }> {
	return page.evaluate(
		() =>
			new Promise((resolve, reject) => {
				const r = indexedDB.open('pdf-workspace-session');
				r.onerror = () => reject(r.error);
				r.onsuccess = () => {
					const db = r.result;
					const version = db.version;
					if (!db.objectStoreNames.contains('ocr')) {
						db.close();
						return resolve({ version, rows: null });
					}
					const n = db.transaction('ocr').objectStore('ocr').count();
					n.onsuccess = () => {
						db.close();
						resolve({ version, rows: n.result });
					};
				};
			})
	);
}

async function exportWithOcr(page: Page) {
	await page.getByRole('button', { name: 'Export', exact: true }).click();
	const dialog = page.getByRole('dialog', { name: 'Export PDF' });
	await openMore(dialog);
	const option = dialog.getByRole('switch', { name: OPTION });
	await expect(option).toBeVisible({ timeout: 30_000 });
	if (!(await option.isChecked())) await option.click();
	await dialog.getByRole('button', { name: 'Export', exact: true }).click();
	const done = page.getByRole('dialog', { name: 'Your file is ready' });
	await expect(done.getByText('Checked: 8 pages, opens cleanly.')).toBeVisible({ timeout: 150_000 });
	await expect(done.getByText('2 pages made searchable. 2 pages were left as they were because the text could not be read well enough.')).toBeVisible();
	await expect(done.getByText('The searchable text reads back on every page that got it.')).toBeVisible();
	await done.getByRole('button', { name: /^(Done|Close)$/ }).first().click();
	await expect(done).toBeHidden();
}

test('a page is read once: the editor reads, the export reuses; after a reload nothing is read; forgetting deletes the text', async ({ page }, info) => {
	test.skip(info.project.name !== 'desktop-chrome', 'desktop only');
	test.setTimeout(240_000);
	const ocrFiles: string[] = [];
	page.context().on('request', (r) => {
		if (/tesseract-core|traineddata|\/worker\.min-/.test(r.url())) ocrFiles.push(new URL(r.url()).pathname);
	});
	await page.goto('/');
	await page.locator('input[type=file]').first().setInputFiles([corpus('ocr-scans.pdf')]);
	await expect(options(page)).toHaveCount(8, { timeout: 30_000 });
	// A short scan is read whole in the background as soon as it is added.
	await expect(page.getByText('Text in this scan can now be selected.')).toBeVisible({ timeout: 120_000 });
	// Kept with the saved work: the 4 qualifying pages, accepted or declined.
	await expect.poll(async () => (await ocrRows(page)).rows, { timeout: 30_000 }).toBe(4);
	expect((await ocrRows(page)).version).toBe(3);
	// The export reads none of them again.
	await exportWithOcr(page);
	await expect(page.getByText(/^Reading page/)).toHaveCount(0);

	// A new visit: the same export reads nothing, and the OCR engine is never loaded.
	await page.reload();
	ocrFiles.length = 0;
	await expect(cards(page)).toHaveCount(1);
	await cards(page).first().click();
	await expect(options(page)).toHaveCount(8, { timeout: 30_000 });
	const progress: string[] = [];
	await page.exposeFunction('noteProgress', (t: string) => progress.push(t));
	await page.evaluate(() => {
		new MutationObserver(() => {
			const t = document.body.innerText.match(/Reading page \d+ of \d+[^\n]*/);
			if (t) (window as unknown as { noteProgress: (s: string) => void }).noteProgress(t[0]);
		}).observe(document.body, { subtree: true, childList: true, characterData: true });
	});
	await exportWithOcr(page);
	expect(progress).toEqual([]);
	expect(ocrFiles).toEqual([]);

	// Forgetting the work deletes its text too.
	await page.getByRole('button', { name: 'Home', exact: true }).click();
	await page.getByRole('button', { name: 'Forget ocr-scans.pdf' }).click();
	await page.getByRole('dialog', { name: 'Forget this work?' }).getByRole('button', { name: 'Forget', exact: true }).click();
	await expect(cards(page)).toHaveCount(0);
	await expect.poll(async () => (await ocrRows(page)).rows, { timeout: 30_000 }).toBe(0);
});

test('work saved by version 2 of the database is kept when it is upgraded to version 3', async ({ page }, info) => {
	test.skip(info.project.name !== 'desktop-chrome', 'desktop only');
	test.setTimeout(120_000);
	// Saved work as this build stores it...
	await page.goto('/');
	await page.locator('input[type=file]').first().setInputFiles([corpus('multi.pdf')]);
	await expect(options(page)).toHaveCount(6, { timeout: 30_000 });
	await expect(page.getByTestId('save-line')).toContainText('Saved on this device only.');
	await page.waitForTimeout(1500);
	// ...laid out again as version 2 had it (the same stores, no `ocr`), from a page that does not run the app.
	await page.goto('/privacy');
	await page.evaluate(async () => {
		const open = (v?: number, up?: (db: IDBDatabase) => void) =>
			new Promise<IDBDatabase>((resolve, reject) => {
				const r = v ? indexedDB.open('pdf-workspace-session', v) : indexedDB.open('pdf-workspace-session');
				if (up) r.onupgradeneeded = () => up(r.result);
				r.onsuccess = () => resolve(r.result);
				r.onerror = () => reject(r.error);
			});
		const all = (db: IDBDatabase, s: string) =>
			new Promise<{ keys: IDBValidKey[]; values: unknown[] }>((resolve) => {
				const st = db.transaction(s).objectStore(s);
				const k = st.getAllKeys();
				const v = st.getAll();
				v.onsuccess = () => resolve({ keys: k.result, values: v.result });
			});
		const db = await open();
		const projects = await all(db, 'projects');
		const thumbs = await all(db, 'thumbs');
		const blobs = await all(db, 'blobs');
		db.close();
		if (projects.values.length !== 1 || blobs.values.length !== 1) throw new Error('nothing saved');
		await new Promise<void>((resolve, reject) => {
			const r = indexedDB.deleteDatabase('pdf-workspace-session');
			r.onsuccess = () => resolve();
			r.onerror = () => reject(r.error);
		});
		const v2 = await open(2, (d) => {
			d.createObjectStore('session');
			d.createObjectStore('blobs', { keyPath: 'hash' });
			d.createObjectStore('projects');
			d.createObjectStore('thumbs');
		});
		const tx = v2.transaction(['projects', 'thumbs', 'blobs'], 'readwrite');
		projects.keys.forEach((k, i) => tx.objectStore('projects').put(projects.values[i], k));
		thumbs.keys.forEach((k, i) => tx.objectStore('thumbs').put(thumbs.values[i], k));
		for (const b of blobs.values) tx.objectStore('blobs').put(b);
		await new Promise((resolve) => (tx.oncomplete = resolve));
		v2.close();
	});
	expect(await ocrRows(page)).toEqual({ version: 2, rows: null });
	// The app upgrades it: the work is there and opens.
	await page.goto('/');
	await expect(cards(page)).toHaveCount(1);
	await expect(cards(page).first()).toHaveAccessibleName(/^multi\.pdf, 6 pages/);
	await cards(page).first().click();
	await expect(options(page)).toHaveCount(6, { timeout: 30_000 });
	expect(await ocrRows(page)).toEqual({ version: 3, rows: 0 });
});
