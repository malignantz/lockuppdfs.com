// The decision logic of the campaign site's Worker (lockup-visits.ts). It lives in its own
// module because a Worker's main module may export only handlers.
//
// It runs only for the HTML pages (`run_worker_first` lists them); every other file is
// served by the assets layer without it. It always answers with the assets response,
// untouched. For a real page load it also sends one pageview to the self-hosted visit
// counter (Umami), after the response, so the visitor never waits for it and a dead
// counter can never slow or break a page. The one other thing it does: /give, where the
// donation link points, counts the click the same way and forwards to the fundraiser. Nothing is added to the page: the browser
// still talks only to this origin.
//
// What is sent: the page path (no query string, except the campaign tags below), the
// referring page (origin + path, no query), the first language tag, the visitor's User-Agent and IP. Umami works out the
// browser, OS, device and location from those and keeps them; it does not keep the IP.

export interface Env {
	ASSETS: { fetch(request: Request): Promise<Response> };
	/** The website id in Umami (a plain var, not a secret). */
	UMAMI_WEBSITE_ID: string;
	/** Umami's collect endpoint, e.g. https://stats.meseeks.xyz/api/press. */
	UMAMI_URL: string;
}

export interface Ctx {
	waitUntil(promise: Promise<unknown>): void;
}

export const HOSTNAME = 'lockuppdfs.com';
/** The pages that are counted (the same list as `run_worker_first`). */
export const PAGES = new Set(['/', '/privacy', '/kit']);
export const TIMEOUT_MS = 3000;

export interface Pageview {
	type: 'event';
	payload: {
		website: string;
		hostname: string;
		url: string;
		referrer?: string;
		language?: string;
		title: string;
		ip?: string;
		userAgent?: string;
		name?: string;
		data?: Record<string, string>;
	};
}

/** A real page load: a GET navigation to a page, not a prefetch, prerender or background fetch. */
export function isPageView(request: Request, response: Response): boolean {
	if (request.method !== 'GET') return false;
	if (response.status !== 200 && response.status !== 304) return false;
	if (!PAGES.has(new URL(request.url).pathname)) return false;
	const h = request.headers;
	const purpose = `${h.get('sec-purpose') ?? ''} ${h.get('purpose') ?? ''} ${h.get('x-moz') ?? ''}`.toLowerCase();
	if (/prefetch|prerender|preview/.test(purpose)) return false;
	const mode = h.get('sec-fetch-mode');
	const dest = h.get('sec-fetch-dest');
	if (mode !== null || dest !== null) return mode === 'navigate' && (dest === null || dest === 'document');
	// No fetch metadata (older browsers): count only requests that ask for a page.
	return (h.get('accept') ?? '').includes('text/html');
}

/** Origin + path of a Referer header, or undefined if there is none or it is not a web address. */
export function referrerOf(value: string | null): string | undefined {
	if (!value) return undefined;
	try {
		const u = new URL(value);
		if (u.protocol !== 'https:' && u.protocol !== 'http:') return undefined;
		return u.origin + u.pathname;
	} catch {
		return undefined;
	}
}

/** The first tag of an Accept-Language header ("en-US,en;q=0.9" → "en-US"). */
export function languageOf(value: string | null): string | undefined {
	const tag = value?.split(',')[0]?.split(';')[0]?.trim();
	return tag && tag !== '*' && /^[A-Za-z0-9-]{1,35}$/.test(tag) ? tag : undefined;
}

/** The link tags that are kept, so that each place the link was posted can be told apart. */
export const TAGS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content'];

/** The page path plus the campaign tags of the link, if any. Every other query parameter is dropped. */
export function pathOf(url: URL): string {
	const kept = new URLSearchParams();
	for (const tag of TAGS) {
		const value = url.searchParams.get(tag);
		if (value && /^[A-Za-z0-9._-]{1,40}$/.test(value)) kept.set(tag, value.toLowerCase());
	}
	const query = kept.toString();
	return query ? `${url.pathname}?${query}` : url.pathname;
}

export function pageview(request: Request, website: string): Pageview {
	const h = request.headers;
	const payload: Pageview['payload'] = { website, hostname: HOSTNAME, url: pathOf(new URL(request.url)), title: '' };
	const referrer = referrerOf(h.get('referer'));
	if (referrer) payload.referrer = referrer;
	const language = languageOf(h.get('accept-language'));
	if (language) payload.language = language;
	// Umami looks up the location from this and hashes it into the visitor id; it is not stored.
	const ip = h.get('cf-connecting-ip');
	if (ip) payload.ip = ip;
	const ua = h.get('user-agent');
	if (ua) payload.userAgent = ua;
	return { type: 'event', payload };
}

/** The donation link on the site points here; the Worker counts the click and forwards. */
export const GIVE_PATH = '/give';
/** Where /give forwards to. The same address as the link in src/lib/site/site.ts (a test checks). */
export const GIVE_URL = 'https://give.missingkids.org/LockUpPDFs';
const PLACES = new Set(['splash', 'done']);

/**
 * The click on the donation link, as a named event on the start page. `from` says which of
 * the two links it was; the campaign tags the page was opened with ride along on the link.
 */
export function giveClick(request: Request, website: string): Pageview {
	const url = new URL(request.url);
	const body = pageview(request, website);
	delete body.payload.referrer;
	url.pathname = '/';
	body.payload.url = pathOf(url);
	body.payload.name = 'give-click';
	const from = url.searchParams.get('from') ?? '';
	body.payload.data = { place: PLACES.has(from) ? from : 'other' };
	return body;
}

/** A person following the link, not a prefetch or a link checker's HEAD. */
export function isGiveClick(request: Request): boolean {
	if (request.method !== 'GET') return false;
	const h = request.headers;
	const purpose = `${h.get('sec-purpose') ?? ''} ${h.get('purpose') ?? ''} ${h.get('x-moz') ?? ''}`.toLowerCase();
	return !/prefetch|prerender|preview/.test(purpose);
}

/** Send one pageview. Never throws, never takes longer than TIMEOUT_MS. */
export async function send(
	env: Env,
	request: Request,
	fetcher: typeof fetch = fetch,
	build: (request: Request, website: string) => Pageview = pageview
): Promise<void> {
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
	try {
		const body = build(request, env.UMAMI_WEBSITE_ID);
		const res = await fetcher(env.UMAMI_URL, {
			method: 'POST',
			headers: { 'content-type': 'application/json', 'user-agent': body.payload.userAgent ?? '' },
			body: JSON.stringify(body),
			signal: controller.signal
		});
		await res.body?.cancel();
	} catch {
		// A dead or slow counter must never matter to the visitor.
	} finally {
		clearTimeout(timer);
	}
}
