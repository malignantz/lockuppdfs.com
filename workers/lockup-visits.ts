// The campaign site's Worker (LockUpPDFs.com only; wired in wrangler.lockup.jsonc).
// Runs only for the HTML pages in `run_worker_first`. Always answers with the assets
// response, untouched; for a real page load it counts one pageview in the background
// (see visits.ts). The main module exports only the handler.
import { isPageView, send, type Ctx, type Env } from './visits';

export default {
	async fetch(request: Request, env: Env, ctx: Ctx): Promise<Response> {
		const response = await env.ASSETS.fetch(request);
		try {
			if (env.UMAMI_URL && env.UMAMI_WEBSITE_ID && isPageView(request, response)) ctx.waitUntil(send(env, request));
		} catch {
			// Counting is best effort; the page is what matters.
		}
		return response;
	}
};
