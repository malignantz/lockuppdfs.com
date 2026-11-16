import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const campaignMock = {
	name: 'X',
	title: 'X',
	description: 'X',
	pitch: { heading: 'h', body: 'b' },
	ask: {
		lead: 'Lead sentence.',
		links: [
			{ label: 'Give to One', href: 'https://one.example/donate' },
			{ label: 'Give to Two', href: 'https://two.example/give' }
		],
		note: 'Note sentence.'
	}
};

async function load(campaign: unknown) {
	vi.resetModules();
	vi.doMock('../../src/lib/site/site', () => ({ SITE_ID: campaign ? 'lockup' : 'plain', campaign }));
	const { render } = await import('svelte/server');
	const comp = (await import('../../src/lib/site/CampaignAsk.svelte')).default;
	const state = await import('../../src/lib/site/ask-state.svelte');
	return { html: () => render(comp, { props: {} }).body, state };
}

function fakeStorage(initial: Record<string, string> = {}) {
	const data = { ...initial };
	return {
		data,
		getItem: (k: string) => (k in data ? data[k] : null),
		setItem: (k: string, v: string) => void (data[k] = v)
	};
}

describe('CampaignAsk', () => {
	beforeEach(() => {
		vi.stubGlobal('sessionStorage', fakeStorage());
	});
	afterEach(() => {
		vi.unstubAllGlobals();
		vi.doUnmock('../../src/lib/site/site');
	});

	it('renders nothing on the plain build', async () => {
		const { html } = await load(null);
		const out = html();
		expect(out.replace(/<!--.*?-->/g, '').trim()).toBe('');
	});

	it('shows the lead, both links and the note on the campaign build', async () => {
		const { html } = await load(campaignMock);
		const out = html();
		expect(out).toContain('Lead sentence.');
		expect(out).toContain('Note sentence.');
		expect(out).toContain('Not now');
		for (const l of campaignMock.ask.links) {
			expect(out).toMatch(new RegExp(`<a href="${l.href.replace(/[.]/g, '\\.')}"[^>]*>${l.label}</a>`));
		}
	});

	it('makes every link an ordinary new-tab link with no ping, prefetch or widget', async () => {
		const { html } = await load(campaignMock);
		const out = html();
		const anchors = out.match(/<a [^>]*>/g) ?? [];
		expect(anchors).toHaveLength(2);
		for (const a of anchors) {
			expect(a).toContain('target="_blank"');
			expect(a).toContain('rel="noopener noreferrer"');
			expect(a).not.toMatch(/ping|ping=/);
		}
		expect(out).not.toMatch(/<(img|script|iframe|link|video|audio|object|embed|source)\b/i);
		expect(out).not.toMatch(/prefetch|preconnect|dns-prefetch|<dialog|role="dialog"|aria-modal/i);
	});

	it('is not rendered once dismissed, and stays dismissed in this visit', async () => {
		const { html, state } = await load(campaignMock);
		expect(html()).toContain('Lead sentence.');
		state.dismissAsk();
		expect(html()).not.toContain('Lead sentence.');
		expect(sessionStorage.getItem('ask-dismissed')).toBe('1');
	});

	it('starts dismissed when this visit already dismissed it', async () => {
		vi.stubGlobal('sessionStorage', fakeStorage({ 'ask-dismissed': '1' }));
		const { html } = await load(campaignMock);
		expect(html()).not.toContain('Lead sentence.');
	});

	it('works with storage blocked, staying dismissed in memory', async () => {
		const blocked = {
			getItem: () => {
				throw new Error('blocked');
			},
			setItem: () => {
				throw new Error('blocked');
			}
		};
		vi.stubGlobal('sessionStorage', blocked);
		const { html, state } = await load(campaignMock);
		expect(html()).toContain('Lead sentence.');
		expect(() => state.dismissAsk()).not.toThrow();
		expect(html()).not.toContain('Lead sentence.');
	});

	it('stores only the one flag', async () => {
		const store = fakeStorage();
		vi.stubGlobal('sessionStorage', store);
		const { state } = await load(campaignMock);
		state.dismissAsk();
		expect(Object.keys(store.data)).toEqual(['ask-dismissed']);
	});
});
