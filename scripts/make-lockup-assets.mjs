// Render the campaign build's (LockUpPDFs) icons and link preview into design/lockup/.
// Run after changing the artwork or the words: `node scripts/make-lockup-assets.mjs`.
// The PNGs are committed; scripts/site-meta.mjs copies them into build-lockup/ only,
// so the plain site keeps its own icons.
//
// The share image uses the start page's own drawing (src/lib/site/BookingPhoto.svelte,
// rendered on the server here) and the words in src/lib/site/site.ts.
import { chromium } from '@playwright/test';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

process.env.VITE_SITE = 'lockup';
const root = fileURLToPath(new URL('..', import.meta.url));
const out = `${root}design/lockup/`;

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
const favicon = readFileSync(`${out}favicon.svg`, 'utf8');
const mark = favicon.replace(/<!--[\s\S]*?-->/, '');
const font = readFileSync(`${root}src/lib/site/fonts/anton-lockup.woff2`).toString('base64');
const html = readFileSync(`${out}share.html`, 'utf8')
	.replace('{{FONT}}', font)
	.replace('{{MARK}}', mark)
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
await page.screenshot({ path: `${out}og.png` });
console.log('wrote og.png');
if (process.argv.includes('--html')) writeFileSync(`${out}share.rendered.html`, html);

// Icons: the mark on white, as in scripts/make-icons.mjs.
const art = `data:image/svg+xml;base64,${Buffer.from(favicon).toString('base64')}`;
const TILE = '#ffffff';
/** name, size, mark scale, corner radius (fraction), transparent outside the tile */
const targets = [
	['icon-192.png', 192, 0.74, 0.22, true],
	['icon-512.png', 512, 0.74, 0.22, true],
	['icon-maskable-192.png', 192, 0.58, 0, false],
	['icon-maskable-512.png', 512, 0.58, 0, false],
	['apple-touch-icon.png', 180, 0.7, 0, false],
	['favicon-32.png', 32, 1, 0, true]
];
for (const [name, size, scale, radius, transparent] of targets) {
	const tile = name.startsWith('favicon') ? 'transparent' : TILE;
	await page.setViewportSize({ width: size, height: size });
	await page.setContent(`<!doctype html><html><body style="margin:0;background:transparent">
		<div style="width:${size}px;height:${size}px;display:grid;place-items:center;background:${tile};border-radius:${radius * 100}%">
			<img src="${art}" style="width:${size * scale}px;height:${size * scale}px">
		</div></body></html>`);
	await page.locator('img').evaluate((img) => img.decode());
	await page.screenshot({ path: `${out}${name}`, omitBackground: transparent });
	console.log('wrote', name);
}
await browser.close();
