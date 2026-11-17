import { describe, expect, it, vi } from 'vitest';
import worker, { isPageView, languageOf, pageview, referrerOf, send, TIMEOUT_MS, type Env } from '../../workers/lockup-visits';

const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36';
const nav = { 'sec-fetch-mode': 'navigate', 'sec-fetch-dest': 'document', 'user-agent': UA };

function req(path: string, headers: Record<string, string> = nav, method = 'GET'): Request {
	return new Request(`https://lockuppdfs.com${path}`, { method, headers });
}
const ok = () => new Response('<!doctype html>', { status: 200, headers: { 'content-type': 'text/html' } });

function env(assets: (r: Request) => Promise<Response> = async () => ok()): Env {
	return { ASSETS: { fetch: assets }, UMAMI_WEBSITE_ID: 'db6c50b3-aad5-4f1a-ab5a-aa8f5262b520', UMAMI_URL: 'https://stats.example/api/press' };
}

function ctx() {
	const waits: Promise<unknown>[] = [];
	return { waits, waitUntil: (p: Promise<unknown>) => void waits.push(p) };
}

describe('what counts as a page view', () => {
	it('counts a GET navigation to each page', () => {
		for (const p of ['/', '/privacy', '/kit']) expect(isPageView(req(p), ok())).toBe(true);
		expect(isPageView(req('/?utm_source=x'), ok())).toBe(true);
		expect(isPageView(req('/'), new Response(null, { status: 304 }))).toBe(true);
	});

	it('skips HEAD, POST, redirects, errors and other paths', () => {
		expect(isPageView(req('/', nav, 'HEAD'), ok())).toBe(false);
		expect(isPageView(req('/', nav, 'POST'), ok())).toBe(false);
		expect(isPageView(req('/privacy/'), ok())).toBe(false);
		expect(isPageView(req('/privacy'), new Response(null, { status: 307 }))).toBe(false);
		expect(isPageView(req('/'), new Response('x', { status: 404 }))).toBe(false);
		expect(isPageView(req('/_app/immutable/entry/start.js'), ok())).toBe(false);
		expect(isPageView(req('/service-worker.js'), ok())).toBe(false);
	});

	it('skips prefetch, prerender, frames and background fetches (service worker precache)', () => {
		expect(isPageView(req('/', { ...nav, 'sec-purpose': 'prefetch' }), ok())).toBe(false);
		expect(isPageView(req('/', { ...nav, 'sec-purpose': 'prefetch;prerender' }), ok())).toBe(false);
		expect(isPageView(req('/', { ...nav, purpose: 'prefetch' }), ok())).toBe(false);
		expect(isPageView(req('/', { ...nav, 'x-moz': 'prefetch' }), ok())).toBe(false);
		expect(isPageView(req('/', { 'sec-fetch-mode': 'navigate', 'sec-fetch-dest': 'iframe' }), ok())).toBe(false);
		expect(isPageView(req('/', { 'sec-fetch-mode': 'same-origin', 'sec-fetch-dest': 'empty' }), ok())).toBe(false);
		expect(isPageView(req('/', { 'sec-fetch-mode': 'cors' }), ok())).toBe(false);
	});

	it('without fetch metadata, counts only requests that ask for HTML', () => {
		expect(isPageView(req('/', { accept: 'text/html,application/xhtml+xml,*/*;q=0.8' }), ok())).toBe(true);
		expect(isPageView(req('/', { accept: '*/*' }), ok())).toBe(false);
		expect(isPageView(req('/', {}), ok())).toBe(false);
	});
});

describe('the pageview payload', () => {
	it('has the expected shape, with query strings dropped', () => {
		const r = req('/privacy?secret=1#x', {
			...nav,
			referer: 'https://news.example.org/story/1?utm_source=feed&id=9',
			'accept-language': 'fr-CA,fr;q=0.9,en;q=0.8',
			'cf-connecting-ip': '81.2.69.142'
		});
		expect(pageview(r, 'site-id')).toEqual({
			type: 'event',
			payload: {
				website: 'site-id',
				hostname: 'lockuppdfs.com',
				url: '/privacy',
				referrer: 'https://news.example.org/story/1',
				language: 'fr-CA',
				title: '',
				ip: '81.2.69.142',
				userAgent: UA
			}
		});
	});

	it('leaves out what the request does not have', () => {
		expect(pageview(req('/', { 'sec-fetch-mode': 'navigate' }), 'id').payload).toEqual({
			website: 'id',
			hostname: 'lockuppdfs.com',
			url: '/',
			title: ''
		});
	});

	it('reduces referrers and languages safely', () => {
		expect(referrerOf('android-app://com.google.android.gm/')).toBeUndefined();
		expect(referrerOf('not a url')).toBeUndefined();
		expect(referrerOf(null)).toBeUndefined();
		expect(referrerOf('https://a.example/')).toBe('https://a.example/');
		expect(languageOf('*')).toBeUndefined();
		expect(languageOf('en')).toBe('en');
		expect(languageOf(' de-DE ;q=1')).toBe('de-DE');
		expect(languageOf('<script>')).toBeUndefined();
	});
});

describe('sending', () => {
	it('posts JSON with the visitor User-Agent', async () => {
		const fetcher = vi.fn(async () => new Response('{}'));
		await send(env(), req('/', { ...nav, 'cf-connecting-ip': '8.8.8.8' }), fetcher as unknown as typeof fetch);
		expect(fetcher).toHaveBeenCalledOnce();
		const [url, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
		expect(url).toBe('https://stats.example/api/press');
		expect(init.method).toBe('POST');
		expect((init.headers as Record<string, string>)['user-agent']).toBe(UA);
		expect(JSON.parse(init.body as string).payload.ip).toBe('8.8.8.8');
	});

	it('swallows network errors', async () => {
		const fetcher = vi.fn(async () => {
			throw new TypeError('network down');
		});
		await expect(send(env(), req('/'), fetcher as unknown as typeof fetch)).resolves.toBeUndefined();
	});

	it('gives up after the timeout', async () => {
		vi.useFakeTimers();
		try {
			const fetcher = (_u: unknown, init?: RequestInit) =>
				new Promise<Response>((_, reject) => init?.signal?.addEventListener('abort', () => reject(new Error('aborted'))));
			const done = send(env(), req('/'), fetcher as unknown as typeof fetch);
			await vi.advanceTimersByTimeAsync(TIMEOUT_MS + 1);
			await expect(done).resolves.toBeUndefined();
		} finally {
			vi.useRealTimers();
		}
	});
});

describe('the Worker', () => {
	it('returns the assets response itself, untouched, and counts in the background', async () => {
		const original = new Response('<!doctype html>', {
			status: 200,
			headers: { 'content-type': 'text/html', 'content-security-policy': "default-src 'self'; connect-src 'self'" }
		});
		const c = ctx();
		const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}'));
		try {
			const res = await worker.fetch(req('/'), env(async () => original), c);
			expect(res).toBe(original);
			expect(c.waits).toHaveLength(1);
			await Promise.all(c.waits);
			expect(fetchSpy).toHaveBeenCalledOnce();
		} finally {
			fetchSpy.mockRestore();
		}
	});

	it('does not count redirects, 404s or non-navigations, and passes them through', async () => {
		for (const [r, res] of [
			[req('/privacy/'), new Response(null, { status: 307, headers: { location: '/privacy' } })],
			[req('/'), new Response('gone', { status: 404 })],
			[req('/', { 'sec-fetch-mode': 'no-cors', 'sec-fetch-dest': 'empty' }), ok()]
		] as const) {
			const c = ctx();
			expect(await worker.fetch(r, env(async () => res), c)).toBe(res);
			expect(c.waits).toHaveLength(0);
		}
	});

	it('a dead counter never breaks the page', async () => {
		const c = ctx();
		const fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('down'));
		try {
			const res = await worker.fetch(req('/kit'), env(), c);
			expect(res.status).toBe(200);
			await expect(Promise.all(c.waits)).resolves.toBeDefined();
		} finally {
			fetchSpy.mockRestore();
		}
	});

	it('without configuration it only serves', async () => {
		const c = ctx();
		const e = { ...env(), UMAMI_URL: '' };
		expect((await worker.fetch(req('/'), e, c)).status).toBe(200);
		expect(c.waits).toHaveLength(0);
	});
});
