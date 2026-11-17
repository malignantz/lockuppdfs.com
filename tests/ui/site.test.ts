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
		expect(campaign?.splash.headline).toBe('Lock up PDFs.');
		expect(campaign?.splash.tagline).toBe('Yes, both kinds.');
		expect(campaign?.splash.give.heading).toBe('Donate to charity, not PDF software companies.');
		expect(campaign?.ask.lead).toContain('Donate to charity, not PDF software companies');
	});

	it('gives only plain https links to the charities, with the not-connected note', async () => {
		vi.stubEnv('VITE_SITE', 'lockup');
		const { campaign } = await import('../../src/lib/site/site');
		const links = campaign!.ask.links;
		expect(links.map((l) => l.label)).toEqual(['Give to NCMEC', 'Give to Thorn']);
		for (const l of links) expect(l.href).toMatch(/^https:\/\/[^/]+\//);
		expect(campaign!.ask.note).toContain('not connected to either charity');
	});

	it('keeps the campaign wording within its rules', async () => {
		vi.stubEnv('VITE_SITE', 'lockup');
		const { campaign } = await import('../../src/lib/site/site');
		const text = JSON.stringify(campaign).toLowerCase();
		// The slang is never spelled out, no real person is named, no affiliation is claimed.
		for (const word of ['pedo', 'paedo', 'garrett', 'holmes', 'partner', 'official', 'endorse'])
			expect(text, word).not.toContain(word);
		expect(text).not.toMatch(/\$\d/);
	});
});
