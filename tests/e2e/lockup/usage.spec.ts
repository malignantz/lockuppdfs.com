/**
 * The campaign build counts which tools get used: opening a file, a tool that puts something
 * on a page and each finished export post one name each to /use on this site, once per
 * document (an export every time), and nothing else is ever sent.
 */
import { fileURLToPath } from 'node:url';
import type { Page } from '@playwright/test';
import { test, expect } from '../fixtures';
import { chooseTool, tapPage } from '../editor-helpers';

const corpus = (name: string) => fileURLToPath(new URL(`../../corpus/files/${name}`, import.meta.url));

function recordUse(page: Page, baseURL: string) {
	const sent: { method: string; body: string | null }[] = [];
	page.on('request', (r) => {
		const url = new URL(r.url());
		if (url.origin === new URL(baseURL).origin && url.pathname === '/use') sent.push({ method: r.method(), body: r.postData() });
	});
	return sent;
}

async function exportOnce(page: Page) {
	await page.getByRole('button', { name: 'Export', exact: true }).click();
	const form = page.getByRole('dialog', { name: 'Export PDF' });
	await form.getByRole('button', { name: 'Export', exact: true }).click();
	const done = page.getByRole('dialog', { name: 'Your file is ready' });
	await expect(done.getByRole('button', { name: 'Download' })).toBeVisible({ timeout: 60_000 });
	return done;
}

test('opening a file, one tool and each export post their names to /use, and nothing else', async ({ page, baseURL }) => {
	test.setTimeout(120_000);
	const sent = recordUse(page, baseURL!);
	const names = () => sent.map((s) => (s.body ? JSON.parse(s.body).name : null));

	await page.goto('/');
	await page.locator('input[type=file]').first().setInputFiles([corpus('multi.pdf')]);
	await expect(page.getByRole('option')).toHaveCount(6, { timeout: 30_000 });
	await expect.poll(names).toEqual(['open-pdf']);

	// The Check tool, used twice: counted once.
	await page.getByRole('option').first().focus();
	await page.keyboard.press('Enter');
	await expect(page.getByRole('dialog', { name: /^Edit page 1 of 6/ })).toBeVisible();
	await page.waitForFunction(() => {
		const c = document.querySelector<HTMLCanvasElement>('[data-testid=editor-page] canvas');
		return !!c && c.width > 0 && getComputedStyle(c).visibility !== 'hidden';
	});
	await chooseTool(page, 'Check');
	await tapPage(page, 0.4, 0.4);
	await tapPage(page, 0.5, 0.5);
	await page.keyboard.press('Escape');
	await page.getByRole('button', { name: 'Done', exact: true }).click();
	await expect.poll(names).toEqual(['open-pdf', 'tool-check']);

	// An export with the default options: done, and Optimize (on by default).
	const done = await exportOnce(page);
	await expect.poll(names).toEqual(['open-pdf', 'tool-check', 'export-done', 'export-optimize']);
	await Promise.all([page.waitForEvent('download'), done.getByRole('button', { name: 'Download' }).click()]);
	await done.getByRole('button', { name: 'Done' }).click();
	await expect(done).toBeHidden();

	// A second export of the same document counts again.
	await exportOnce(page);
	await expect.poll(names).toEqual(['open-pdf', 'tool-check', 'export-done', 'export-optimize', 'export-done', 'export-optimize']);

	// Every one was a POST of exactly {"name": "..."}.
	for (const s of sent) {
		expect(s.method).toBe('POST');
		expect(Object.keys(JSON.parse(s.body!))).toEqual(['name']);
	}
});

test('the privacy page says which tools are used is counted, and never the file', async ({ page }) => {
	await page.goto('/privacy');
	await expect(page.locator('#visits')).toContainText('the server also counts the name of that tool, and only its name: never anything about the file.');
});
