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
		expect(campaign?.splash.headline.join(' ')).toBe('PDFs. Locked up.');
		expect(campaign?.splash.placard.charge.join(' ')).toBe('CHARGE: NONE');
	});

	it('keeps the campaign wording inside the rules', async () => {
		vi.stubEnv('VITE_SITE', 'lockup');
		const { campaign } = await import('../../src/lib/site/site');
		const all = JSON.stringify(campaign);
		// The joke is aimed at offenders only, never spelled out, never anyone's name.
		expect(all).not.toMatch(/pedo|paedo/i);
		expect(all).not.toMatch(/garrett|holmes/i);
		// No claim of a link to the charities, no prices.
		expect(all).not.toMatch(/partner|official|endorse|sponsor/i);
		expect(all).not.toMatch(/[$€£]\s?\d/);
		for (const l of campaign!.ask.links) expect(l.href).toMatch(/^https:\/\//);
	});
});
