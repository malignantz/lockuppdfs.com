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
		expect(campaign?.splash.headline).toEqual(['PDFs.', 'Locked up.']);
		// The board states the fee: a "charge" would fight the giving lead's court-of-law line.
		expect(campaign?.splash.placard.fee).toEqual(['FEE:', '$0.00']);
		expect(JSON.stringify(campaign?.splash.placard)).not.toMatch(/charge/i);
		expect(campaign?.splash.statement).toBe('Free PDF tools. Combine, sign, shrink, convert.');
		expect(campaign?.splash.give.heading).toBe('Donate to charity, not PDF software companies.');
		expect(campaign?.splash.give.lead).toBe(
			'Some sites charge for PDF files. We want PDF files charged in a court of law. Give what you would have paid to the people who protect children.'
		);
		expect(campaign?.ask.lead).toBe(
			'That was free. Donate to charity, not PDF software companies: give what you would have paid to child protection instead.'
		);
		expect(campaign?.splash.chips.map((c) => c.label)).toEqual(['Combine', 'Fill & sign', 'Make smaller', 'Pictures to PDF']);
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
