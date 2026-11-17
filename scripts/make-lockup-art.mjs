// Render the LockUpPDFs campaign art with headless Chrome: the share image
// (design/lockup/og.html -> og.png, 1200x630) and the campaign build's icons
// (design/lockup/icon.svg and icon-small.svg -> design/lockup/icons/).
// Run after changing the artwork: `node scripts/make-lockup-art.mjs`.
// scripts/site-meta.mjs copies the results into build-lockup/; the plain site's
// icons in static/ are not touched.
import { chromium } from '@playwright/test';
import { copyFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

const dir = fileURLToPath(new URL('../design/lockup/', import.meta.url));
const out = `${dir}icons/`;
mkdirSync(out, { recursive: true });
const BLACK = '#0d0d0c';
const dataUrl = (file) => `data:image/svg+xml;base64,${readFileSync(`${dir}${file}`).toString('base64')}`;

/** name, size, art, art scale (fraction of the canvas), corner radius (fraction), transparent outside the tile */
const targets = [
	['icon-192.png', 192, 'icon.svg', 0.8, 0.22, true],
	['icon-512.png', 512, 'icon.svg', 0.8, 0.22, true],
	// Maskable: full bleed, the mark inside the 80% safe circle.
	['icon-maskable-192.png', 192, 'icon.svg', 0.62, 0, false],
	['icon-maskable-512.png', 512, 'icon.svg', 0.62, 0, false],
	// iOS rounds the corners itself and wants no transparency.
	['apple-touch-icon.png', 180, 'icon.svg', 0.76, 0, false],
	['favicon-32.png', 32, 'icon-small.svg', 1, 0, true]
];

const chrome = '/opt/google/chrome/chrome';
const browser = await chromium.launch(existsSync(chrome) ? { executablePath: chrome } : {});
const page = await browser.newPage();

for (const [name, size, file, scale, radius, transparent] of targets) {
	const tile = name.startsWith('favicon') ? 'transparent' : BLACK;
	await page.setViewportSize({ width: size, height: size });
	await page.setContent(`<!doctype html><html><body style="margin:0;background:transparent">
		<div style="width:${size}px;height:${size}px;display:grid;place-items:center;background:${tile};border-radius:${radius * 100}%">
			<img src="${dataUrl(file)}" style="width:${size * scale}px;height:${size * scale}px">
		</div></body></html>`);
	await page.locator('img').evaluate((img) => img.decode());
	await page.screenshot({ path: `${out}${name}`, omitBackground: transparent });
	console.log('wrote icons/' + name);
}
copyFileSync(`${dir}icon-small.svg`, `${out}favicon.svg`);
console.log('wrote icons/favicon.svg');

await page.setViewportSize({ width: 1200, height: 630 });
await page.goto(pathToFileURL(`${dir}og.html`).href);
await page.evaluate(() => document.fonts.ready);
await page.locator('img').evaluate((img) => img.decode());
await page.screenshot({ path: `${dir}og.png` });
console.log('wrote og.png');

await browser.close();
