// Render the LockUpPDFs campaign art with headless Chrome: the share image
// (design/lockup/og.html -> og.png, 1200x630) and the campaign build's icons
// (design/lockup/icon.svg -> design/lockup/icons/).
// Run after changing the artwork or the words: `node scripts/make-lockup-art.mjs`.
// The share image uses the start page's own drawing (src/lib/site/BookingPhoto.svelte,
// rendered on the server here) and the words in src/lib/site/site.ts.
// scripts/site-meta.mjs copies the results into build-lockup/; the plain site's
// icons in static/ are not touched.
import { chromium } from '@playwright/test';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { copyFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

process.env.VITE_SITE = 'lockup';
const root = fileURLToPath(new URL('..', import.meta.url));
const dir = `${root}design/lockup/`;
const out = `${dir}icons/`;
mkdirSync(out, { recursive: true });

const server = await createServer({
	root,
	configFile: false,
	logLevel: 'silent',
	appType: 'custom',
	server: { middlewareMode: true },
	plugins: [svelte({ compilerOptions: { runes: true }, emitCss: false })]
});
const { campaign } = await server.ssrLoadModule('/src/lib/site/site.ts');
const { render } = await server.ssrLoadModule('svelte/server');
const { default: BookingPhoto } = await server.ssrLoadModule('/src/lib/site/BookingPhoto.svelte');
const photo = render(BookingPhoto, {
	props: { label: campaign.share.alt, placard: campaign.splash.placard, id: 'og' }
}).body.replace(/<!--[^>]*-->/g, '');
await server.close();

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
const icon = readFileSync(`${dir}icon.svg`, 'utf8');
const font = readFileSync(`${dir}anton-subset.woff2`).toString('base64');
const html = readFileSync(`${dir}og.html`, 'utf8')
	.replace('{{FONT}}', font)
	.replace('{{MARK}}', icon.replace(/<!--[\s\S]*?-->/, ''))
	.replace('{{WORD_A}}', esc(campaign.wordmark[0]))
	.replace('{{WORD_B}}', esc(campaign.wordmark[1]))
	.replace('{{HEAD_A}}', esc(campaign.splash.headline[0]))
	.replace('{{HEAD_B}}', esc(campaign.splash.headline[1]))
	.replace('{{LINE}}', esc(campaign.share.line))
	.replace('{{PHOTO}}', photo);

const chrome = '/opt/google/chrome/chrome';
const browser = await chromium.launch(existsSync(chrome) ? { executablePath: chrome } : {});
const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
await page.setContent(html);
await page.evaluate(() => document.fonts.ready);
await page.screenshot({ path: `${dir}og.png` });
console.log('wrote og.png');

// Icons: the mark on the campaign's paper.
const art = `data:image/svg+xml;base64,${Buffer.from(icon).toString('base64')}`;
const PAPER = '#fcfbf8';
/** name, size, mark scale (fraction of the canvas), corner radius (fraction), transparent outside the tile */
const targets = [
	['icon-192.png', 192, 0.74, 0.22, true],
	['icon-512.png', 512, 0.74, 0.22, true],
	// Maskable: full bleed, the mark inside the 80% safe circle.
	['icon-maskable-192.png', 192, 0.58, 0, false],
	['icon-maskable-512.png', 512, 0.58, 0, false],
	// iOS rounds the corners itself and wants no transparency.
	['apple-touch-icon.png', 180, 0.7, 0, false],
	['favicon-32.png', 32, 1, 0, true]
];
for (const [name, size, scale, radius, transparent] of targets) {
	const tile = name.startsWith('favicon') ? 'transparent' : PAPER;
	await page.setViewportSize({ width: size, height: size });
	await page.setContent(`<!doctype html><html><body style="margin:0;background:transparent">
		<div style="width:${size}px;height:${size}px;display:grid;place-items:center;background:${tile};border-radius:${radius * 100}%">
			<img src="${art}" style="width:${size * scale}px;height:${size * scale}px">
		</div></body></html>`);
	await page.locator('img').evaluate((img) => img.decode());
	await page.screenshot({ path: `${out}${name}`, omitBackground: transparent });
	console.log('wrote icons/' + name);
}
copyFileSync(`${dir}icon.svg`, `${out}favicon.svg`);
console.log('wrote icons/favicon.svg');
await browser.close();
