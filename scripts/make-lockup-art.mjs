// The LockUpPDFs (VITE_SITE=lockup) icons and share image, rendered with headless Chrome
// from design/lockup/icon.svg and design/lockup/og.html into static-lockup/.
// Run after changing the artwork: `node scripts/make-lockup-art.mjs`.
// scripts/site-meta.mjs copies static-lockup/ over the campaign build only.
import { chromium } from '@playwright/test';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const out = `${root}static-lockup/`;
const icon = readFileSync(`${root}design/lockup/icon.svg`, 'utf8');

/** Full bleed (square tile, no rim) for platforms that cut their own shape; `inset` shrinks the glyph. */
function variant(bleed, inset = 1) {
	let svg = icon;
	if (bleed) svg = svg.replace(/ rx="28"/, '').replace(/<rect class="rim"[^>]*\/>/, '');
	if (inset !== 1) svg = svg.replace('<g class="glyph">', `<g class="glyph" transform="translate(60 60) scale(${inset}) translate(-60 -60)">`);
	return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
}

/** name, size, full bleed, glyph scale */
const targets = [
	['icon-192.png', 192, false, 1],
	['icon-512.png', 512, false, 1],
	// Maskable: full bleed, glyph inside the 80% safe circle.
	['icon-maskable-192.png', 192, true, 0.78],
	['icon-maskable-512.png', 512, true, 0.78],
	// iOS rounds the corners itself and wants no transparency.
	['apple-touch-icon.png', 180, true, 0.92],
	['favicon-32.png', 32, false, 1]
];

const chrome = '/opt/google/chrome/chrome';
const browser = await chromium.launch(existsSync(chrome) ? { executablePath: chrome } : {});
const page = await browser.newPage();

for (const [name, size, bleed, inset] of targets) {
	await page.setViewportSize({ width: size, height: size });
	await page.setContent(`<!doctype html><html><body style="margin:0;background:transparent">
		<img src="${variant(bleed, inset)}" style="display:block;width:${size}px;height:${size}px"></body></html>`);
	await page.locator('img').evaluate((img) => img.decode());
	await page.screenshot({ path: `${out}${name}`, omitBackground: !bleed });
	console.log('wrote', name);
}

// The SVG favicon is the icon itself, without the comment.
writeFileSync(`${out}favicon.svg`, icon.replace(/\s*<!--[\s\S]*?-->/, ''));
console.log('wrote favicon.svg');

const og = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
await og.goto(pathToFileURL(`${root}design/lockup/og.html`).href);
await og.evaluate(() => document.fonts.ready);
await og.waitForTimeout(200);
await og.screenshot({ path: `${out}og.png` });
console.log('wrote og.png');

await browser.close();
