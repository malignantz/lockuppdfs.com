import { defineConfig, devices } from '@playwright/test';
import { existsSync } from 'node:fs';

// On the Debian box (and its CI runner) Playwright uses the system Chrome.
const systemChrome = '/opt/google/chrome/chrome';
const launchOptions = existsSync(systemChrome) ? { executablePath: systemChrome } : {};
// E2E_PORT lets parallel worktrees on one machine run their own server.
const port = Number(process.env.E2E_PORT ?? 4317);
// The campaign build (VITE_SITE=lockup) is served on the next port up.
const lockupPort = port + 1;

export default defineConfig({
	testDir: 'tests/e2e',
	fullyParallel: true,
	forbidOnly: !!process.env.CI,
	retries: process.env.CI ? 1 : 0,
	workers: process.env.CI ? 2 : undefined,
	reporter: process.env.CI ? [['list'], ['github']] : 'list',
	use: {
		baseURL: `http://127.0.0.1:${port}`,
		trace: 'off',
		launchOptions
	},
	projects: [
		{
			name: 'desktop-chrome',
			testIgnore: '**/lockup/**',
			use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 }, launchOptions }
		},
		{
			name: 'phone',
			testIgnore: '**/lockup/**',
			use: { ...devices['Pixel 7'], launchOptions }
		},
		{
			// Specs under tests/e2e/lockup/ run only here, against the VITE_SITE=lockup build.
			name: 'lockup',
			testMatch: '**/lockup/**/*.spec.ts',
			use: {
				...devices['Desktop Chrome'],
				viewport: { width: 1440, height: 900 },
				baseURL: `http://127.0.0.1:${lockupPort}`,
				launchOptions
			}
		}
	],
	webServer: [{
		// The real build, served with its real _headers (CSP included).
		// CI builds in an earlier step and sets E2E_SKIP_BUILD.
		// VITE_DEV_HARNESS=1 adds the /dev-editor test harness; production builds leave it out.
		command: `${process.env.E2E_SKIP_BUILD ? '' : 'VITE_DEV_HARNESS=1 npm run build && '}node scripts/serve-build.mjs ${port}`,
		url: `http://127.0.0.1:${port}/`,
		reuseExistingServer: !process.env.CI,
		timeout: 180_000,
		stdout: 'ignore',
		stderr: 'pipe'
	},
	{
		// The campaign build, in build-lockup/ with its own SvelteKit work folder.
		command: `${process.env.E2E_SKIP_BUILD ? '' : 'VITE_SITE=lockup VITE_DEV_HARNESS=1 npm run build && '}VITE_SITE=lockup node scripts/serve-build.mjs ${lockupPort}`,
		url: `http://127.0.0.1:${lockupPort}/`,
		reuseExistingServer: !process.env.CI,
		timeout: 180_000,
		stdout: 'ignore',
		stderr: 'pipe'
	}]
});
