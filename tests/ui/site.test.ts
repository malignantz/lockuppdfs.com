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
		expect(campaign?.splash.headline).toBe('LOCK UP PDFs.');
		expect(campaign?.splash.give.lead).toContain('Give what you saved');
		expect(campaign?.ask.links.map((l) => l.label)).toEqual(['Give to NCMEC', 'Give to Thorn']);
	});

	it('keeps the campaign wording within its own rules', async () => {
		vi.stubEnv('VITE_SITE', 'lockup');
		const { campaign } = await import('../../src/lib/site/site');
		const text = JSON.stringify(campaign);
		// The joke is aimed at offenders by the slang only; the word itself is never spelled out.
		expect(text).not.toMatch(/pedo|paedo/i);
		// No claim of a link with either charity, and no owner's name on the campaign site.
		expect(text).not.toMatch(/partner|official|endorse|garrett|holmes/i);
		for (const l of campaign!.ask.links) expect(l.href).toMatch(/^https:\/\//);
	});
});
