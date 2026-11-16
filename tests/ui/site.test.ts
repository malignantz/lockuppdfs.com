import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
	vi.unstubAllEnvs();
	vi.resetModules();
});

describe('site variant', () => {
	it('is the plain site, with no campaign, unless VITE_SITE=lockup', async () => {
		vi.stubEnv('VITE_SITE', '');
		const { SITE_ID, campaign } = await import('../../src/lib/site/site');
		expect(SITE_ID).toBe('plain');
		expect(campaign).toBeNull();
	});

	it('carries the campaign wording on the lockup build', async () => {
		vi.stubEnv('VITE_SITE', 'lockup');
		const { SITE_ID, campaign } = await import('../../src/lib/site/site');
		expect(SITE_ID).toBe('lockup');
		expect(campaign?.name).toBe('LockUpPDFs');
		expect(campaign?.title).toContain('LockUpPDFs');
		expect(campaign?.pitch.heading).not.toBe('');
	});
});
