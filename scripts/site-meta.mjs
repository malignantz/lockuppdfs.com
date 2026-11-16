// Post-build, campaign build only (VITE_SITE=lockup): write the campaign's
// title, description and share tags into the prerendered pages and the web
// manifest, so a shared link shows the right text without running any script.
// The wording comes from src/lib/site/site.ts, the one place it lives.
// On the plain build this script does nothing, so that output is untouched.
import { copyFileSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

if (process.env.VITE_SITE !== 'lockup') process.exit(0);

const build = fileURLToPath(new URL('../build-lockup/', import.meta.url));
const art = fileURLToPath(new URL('../static-lockup/', import.meta.url));
// Absolute, because share previews fetch it from elsewhere.
const ORIGIN = 'https://lockuppdfs.com';

// The campaign's icons and share image (made by scripts/make-lockup-art.mjs) replace the
// plain site's files of the same names in this build only.
for (const name of readdirSync(art)) copyFileSync(join(art, name), join(build, name));

// Preload the two typeface files (src/lib/site/theme-lockup.css), so the headline paints in them.
const assets = join(build, '_app/immutable/assets');
const fonts = readdirSync(assets).filter((f) => /^geist-(400|700)\.[\w-]+\.woff2$/.test(f));
if (fonts.length !== 2) throw new Error(`site-meta: expected two Geist files in ${assets}, found ${fonts.length}`);
const preload = fonts
	.map((f) => `<link rel="preload" href="/_app/immutable/assets/${f}" as="font" type="font/woff2" crossorigin />`)
	.join('\n\t\t');

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

const share = [
	`<meta property="og:type" content="website" />`,
	`<meta property="og:site_name" content="${esc(campaign.name)}" />`,
	`<meta property="og:title" content="${esc(campaign.title)}" />`,
	`<meta property="og:description" content="${esc(campaign.description)}" />`,
	`<meta property="og:url" content="${ORIGIN}/" />`,
	`<meta property="og:image" content="${ORIGIN}/og.png" />`,
	`<meta property="og:image:width" content="1200" />`,
	`<meta property="og:image:height" content="630" />`,
	`<meta property="og:image:alt" content="${esc(`${campaign.splash.headline} ${campaign.splash.tagline} Free PDF tools at lockuppdfs.com`)}" />`,
	`<meta name="twitter:card" content="summary_large_image" />`,
	`<meta name="twitter:title" content="${esc(campaign.title)}" />`,
	`<meta name="twitter:description" content="${esc(campaign.description)}" />`,
	`<meta name="twitter:image" content="${ORIGIN}/og.png" />`
].join('\n\t\t');

let n = 0;
for (const file of htmlFiles(build)) {
	let html = readFileSync(file, 'utf8');
	// The campaign palette's bar colours (src/lib/site/theme-lockup.css).
	html = sub(html, /(name="theme-color" content=")#fbfaf6(")/, '$1#ffffff$2', 'light theme-color', file);
	html = sub(html, /(name="theme-color" content=")#211e18(")/, '$1#13161d$2', 'dark theme-color', file);
	html = sub(html, /(<link rel="manifest"[^>]*>)/, `${preload}\n\t\t$1`, 'manifest link', file);
	// The pages that set their own title and description (the privacy page) keep them.
	const own = /<title>(?!PDF Workspace)/.test(html);
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
manifest.background_color = '#ffffff';
manifest.theme_color = '#ffffff';
writeFileSync(manifestPath, JSON.stringify(manifest, null, '\t') + '\n');
console.log(`site-meta: ${n} pages and the manifest now carry the ${campaign.name} wording`);
