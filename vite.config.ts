import { fileURLToPath } from 'node:url';
import adapter from '@sveltejs/adapter-static';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

/**
 * Content-Security-Policy. SvelteKit adds a sha256 hash of its inline bootstrap
 * script to `script-src` and writes the policy into each prerendered page as a
 * <meta> tag. `scripts/csp-headers.mjs` (run after `vite build`) reads the same
 * hashes out of the built HTML and writes the identical policy, plus the
 * header-only directives (`frame-ancestors`), into `build/_headers`.
 */
export const cspDirectives = {
	'default-src': ['self'],
	'script-src': ['self', 'wasm-unsafe-eval'],
	'style-src': ['self', 'unsafe-inline'],
	'img-src': ['self', 'blob:', 'data:'],
	'font-src': ['self'],
	'connect-src': ['self'],
	'worker-src': ['self', 'blob:'],
	'manifest-src': ['self'],
	'object-src': ['none'],
	'base-uri': ['self'],
	'form-action': ['none']
} as const;

// The campaign build (VITE_SITE=lockup) writes to its own folders so both
// variants can be built side by side: build-lockup/ for the site and
// .svelte-kit-lockup/ for SvelteKit's working files. The plain build is unchanged.
const lockup = process.env.VITE_SITE === 'lockup';

export default defineConfig({
	resolve: {
		// The campaign build's look (palette, typeface) is one stylesheet imported by the
		// layout as 'site-theme.css'. The plain build gets an empty file, so nothing of the
		// campaign's styling can reach pdf.garrettholmes.com.
		alias: {
			'site-theme.css': fileURLToPath(new URL(`./src/lib/site/theme-${lockup ? 'lockup' : 'plain'}.css`, import.meta.url))
		}
	},
	// The engine worker code-splits (qpdf, pdf-lib, PDF.js load on demand), which needs ES workers.
	worker: { format: 'es' },
	plugins: [
		sveltekit({
			compilerOptions: {
				// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
				runes: ({ filename }) =>
					filename.split(/[/\\]/).includes('node_modules') ? undefined : true
			},
			adapter: adapter({
				fallback: '404.html',
				pages: lockup ? 'build-lockup' : 'build',
				assets: lockup ? 'build-lockup' : 'build'
			}),
			...(lockup ? { outDir: '.svelte-kit-lockup' } : {}),
			csp: {
				mode: 'hash',
				directives: structuredClone(cspDirectives) as never
			},
			// Registered by hand in +layout.svelte so dev never gets a worker and
			// the "new version" toast can drive the update.
			serviceWorker: { register: false }
		})
	]
});
