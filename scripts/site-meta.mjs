// Post-build, campaign build only (VITE_SITE=lockup): write the campaign's
// title, description and share tags into the prerendered pages and the web
// manifest, so a shared link shows the right text without running any script.
// The wording comes from src/lib/site/site.ts, the one place it lives.
// On the plain build this script does nothing, so that output is untouched.
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

if (process.env.VITE_SITE !== 'lockup') process.exit(0);

const build = fileURLToPath(new URL('../build-lockup/', import.meta.url));

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
	`<meta name="twitter:card" content="summary" />`,
	`<meta name="twitter:title" content="${esc(campaign.title)}" />`,
	`<meta name="twitter:description" content="${esc(campaign.description)}" />`
].join('\n\t\t');

let n = 0;
for (const file of htmlFiles(build)) {
	let html = readFileSync(file, 'utf8');
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
writeFileSync(manifestPath, JSON.stringify(manifest, null, '\t') + '\n');
console.log(`site-meta: ${n} pages and the manifest now carry the ${campaign.name} wording`);
