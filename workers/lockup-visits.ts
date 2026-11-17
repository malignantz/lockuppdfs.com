// The campaign site's Worker (LockUpPDFs.com only; wired in wrangler.lockup.jsonc).
// Runs only for the paths in `run_worker_first`. For the HTML pages it always answers with
// the assets response, untouched; for a real page load it counts one pageview in the
// background (see visits.ts). For /give it forwards to the fundraiser and counts the click
// in the background. The main module exports only the handler.
import { GIVE_PATH, GIVE_URL, giveClick, isGiveClick, isPageView, send, type Ctx, type Env } from './visits';

export default {
	async fetch(request: Request, env: Env, ctx: Ctx): Promise<Response> {
		if (new URL(request.url).pathname === GIVE_PATH) {
			try {
				if (env.UMAMI_URL && env.UMAMI_WEBSITE_ID && isGiveClick(request)) ctx.waitUntil(send(env, request, fetch, giveClick));
			} catch {
				// Counting is best effort; the forward is what matters.
			}
			return new Response(null, {
				status: 302,
				headers: { location: GIVE_URL, 'cache-control': 'no-store', 'x-robots-tag': 'noindex', 'referrer-policy': 'no-referrer' }
			});
		}
		const response = await env.ASSETS.fetch(request);
		try {
			if (env.UMAMI_URL && env.UMAMI_WEBSITE_ID && isPageView(request, response)) ctx.waitUntil(send(env, request));
		} catch {
			// Counting is best effort; the page is what matters.
		}
		return response;
	}
};
