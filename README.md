Projects Key: `project:pdf-garrettholmes`

# pdf.garrettholmes.com

A free PDF workspace that runs entirely in your browser. Drop in PDFs and
images, arrange every page in one grid, rotate, delete, sign and type on pages,
then export once. Files never leave your device, and every export is checked
before you can download it.

- **One workspace** instead of one tool per page.
- **No uploads.** A Content-Security-Policy blocks the page from contacting any other server.
- **Verified output.** Each export passes a structure check, a page comparison and a re-open test.
- **Your work, kept on this device.** Home shows each piece of work you have open or saved as a card;
  tap one to go back to it, or start something new while the rest stays saved. Kept in this browser only,
  for 7 days after its last change; passwords are never kept.
- **Unlocks files that block printing or copying.** A file that opens without a password
  but limits printing, copying, editing or form filling exports without those limits.
  A file that needs a password to open still needs it: the app never guesses or gets around one.

## Develop

```sh
npm install
npm run dev        # local dev server
npm run check      # types
npm test           # unit tests (engine, store, renderer)
npm run test:e2e   # Playwright, desktop and phone
npm run build      # static site in build/
npx wrangler deploy  # after a build: Cloudflare Worker, static assets only
```

## Two sites from one codebase

The same app is built twice. `VITE_SITE=lockup` at build time makes the campaign
site (LockUpPDFs.com): its own title, description and share tags in the static HTML,
its name and mark in the header, a booking-photo start page with the donation links, and a quiet ask after
a download. Without it you get the plain site, pdf.garrettholmes.com, unchanged.
All campaign wording and the charity links live in `src/lib/site/site.ts` and nowhere else.
The campaign start page is a booking photo of a PDF (`src/lib/site/LockupSplash.svelte` and
`BookingPhoto.svelte`) with the giving links on it; its palette is under `.lockup-theme` and
`html[data-site='lockup']` in `src/app.css` (the latter re-colours the workspace on that build).
Its art lives in `design/lockup/` (mark, display face, share image source); run
`node scripts/make-lockup-art.mjs` after changing the art or the words. `scripts/site-meta.mjs` copies the face, icons and `og.png` into the campaign build only, so
in `vite dev` with `VITE_SITE=lockup` the headline shows in a fallback face.

```sh
npm run build          # plain site into build/
npm run build:lockup   # campaign site into build-lockup/
npx wrangler deploy                                  # plain site (wrangler.jsonc)
npm run deploy:lockup                                # builds, then deploys wrangler.lockup.jsonc
E2E_PORT=4411 npx playwright test --project=lockup   # only the campaign specs (tests/e2e/lockup/)
npm run release        # check, unit tests, then build and deploy both sites
```

Release with `npm run release` so a fix never reaches one site and not the other.

## How it works

See [the plan](docs/plans/plan-2026-11-09.md) for architecture and scope, and
[DESIGN.md](DESIGN.md) for the interface. Engines: [qpdf](https://github.com/qpdf/qpdf)
(page operations, encryption, checking), [PDF.js](https://github.com/mozilla/pdf.js)
(rendering), [pdf-lib](https://github.com/cantoo-scribe/pdf-lib) (stamps).

## License

AGPL-3.0-or-later. See `LICENSE` and `THIRD-PARTY.md`.
