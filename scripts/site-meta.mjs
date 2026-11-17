// Post-build, campaign build only (VITE_SITE=lockup): write the campaign's
// title, description and share tags into the prerendered pages and the web
// manifest, so a shared link shows the right text without running any script.
// The wording comes from src/lib/site/site.ts, the one place it lives.
// On the plain build this script does nothing, so that output is untouched.
import { copyFileSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

if (process.env.VITE_SITE !== 'lockup') process.exit(0);

const build = fileURLToPath(new URL('../build-lockup/', import.meta.url));
// The campaign's own art and display face (design/lockup/, made by scripts/make-lockup-art.mjs).
const art = fileURLToPath(new URL('../design/lockup/', import.meta.url));
const ORIGIN = 'https://lockuppdfs.com';

const server = await createServer({
	configFile: false,
	logLevel: 'silent',
	appType: 'custom',
	server: { middlewareMode: true }
});
const { campaign } = await server.ssrLoadModule('/src/lib/site/site.ts');
await server.close();
if (!campaign) throw new Error('site-meta: VITE_SITE=lockup but site.ts gave no campaign');

const esc = (s) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
const escText = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');

function htmlFiles(dir) {
	return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
		const p = join(dir, e.name);
		if (e.isDirectory()) return e.name === '_app' ? [] : htmlFiles(p);
		return e.name.endsWith('.html') ? [p] : [];
	});
}

function sub(html, re, to, what, file) {
	if (!re.test(html)) throw new Error(`site-meta: ${what} not found in ${file}`);
	return html.replace(re, (...m) => to.replace(/\$(\d)/g, (_, i) => m[Number(i)]));
}

const OG_ALT = 'An orange document behind cell bars with a padlock. LOCK UP PDFs. Free PDF tools.';

const share = [
	`<meta property="og:type" content="website" />`,
	`<meta property="og:site_name" content="${esc(campaign.name)}" />`,
	`<meta property="og:title" content="${esc(campaign.title)}" />`,
	`<meta property="og:description" content="${esc(campaign.description)}" />`,
	`<meta property="og:image" content="${ORIGIN}/og.png" />`,
	`<meta property="og:image:width" content="1200" />`,
	`<meta property="og:image:height" content="630" />`,
	`<meta property="og:image:alt" content="${esc(OG_ALT)}" />`,
	`<meta name="twitter:card" content="summary_large_image" />`,
	`<meta name="twitter:title" content="${esc(campaign.title)}" />`,
	`<meta name="twitter:description" content="${esc(campaign.description)}" />`,
	`<meta name="twitter:image" content="${ORIGIN}/og.png" />`
].join('\n\t\t');

// The display face (Anton, OFL; see THIRD-PARTY.md), only on this build: copied in with a
// content hash so it is cached as immutable and precached like the app's own assets
// (precache-list.mjs runs after this script), and declared in each page's head so the
// first paint already has it. The plain build never references it.
const font = readFileSync(join(art, 'anton-subset.woff2'));
const fontUrl = `/_app/immutable/assets/lockup-display-${createHash('sha256').update(font).digest('hex').slice(0, 10)}.woff2`;
copyFileSync(join(art, 'anton-subset.woff2'), join(build, fontUrl));
const fontHead = [
	`<link rel="preload" href="${fontUrl}" as="font" type="font/woff2" crossorigin />`,
	`<style>@font-face{font-family:'Lockup Display';src:url(${fontUrl}) format('woff2');font-weight:400;font-style:normal;font-display:swap}</style>`
].join('\n\t\t');

// The campaign's icons and share image replace the plain site's at the same paths.
const icons = ['favicon.svg', 'favicon-32.png', 'apple-touch-icon.png', 'icon-192.png', 'icon-512.png', 'icon-maskable-192.png', 'icon-maskable-512.png'];
for (const name of icons) copyFileSync(join(art, 'icons', name), join(build, name));
copyFileSync(join(art, 'og.png'), join(build, 'og.png'));
const BLACK = '#0d0d0c';

let n = 0;
for (const file of htmlFiles(build)) {
	let html = readFileSync(file, 'utf8');
	// The pages that set their own title and description (the privacy page) keep them.
	const own = /<title>(?!PDF Workspace)/.test(html);
	html = sub(html, /(<link rel="manifest"[^>]*>)/, `${fontHead}\n\t\t$1`, 'manifest link', file);
	html = html.replace(/(<meta name="theme-color" content=")[^"]*(")/g, `$1${BLACK}$2`);
	if (!own) {
		html = sub(html, /<title>[^<]*<\/title>/, `<title>${escText(campaign.title)}</title>`, 'title', file);
		html = sub(
			html,
			/<meta\s+name="description"\s+content="[^"]*"\s*\/?>/,
			`<meta name="description" content="${esc(campaign.description)}" />`,
			'description',
			file
		);
		html = sub(
			html,
			/(<meta name="apple-mobile-web-app-title" content=")[^"]*(")/,
			`$1${esc(campaign.name)}$2`,
			'apple title',
			file
		);
		html = sub(html, /(<meta name="mobile-web-app-capable"[^>]*>)/, `$1\n\t\t${share}`, 'anchor', file);
	}
	writeFileSync(file, html);
	n++;
}

const manifestPath = join(build, 'manifest.webmanifest');
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
manifest.name = campaign.name;
manifest.short_name = campaign.name;
manifest.description = campaign.description;
manifest.theme_color = BLACK;
manifest.background_color = BLACK;
writeFileSync(manifestPath, JSON.stringify(manifest, null, '\t') + '\n');
console.log(`site-meta: ${n} pages and the manifest now carry the ${campaign.name} wording`);
