<script lang="ts">
	import Icon from '#lib/ui/Icon.svelte';
	import { campaign, SITE_HOST } from '../../lib/site/site';

	const repo = 'https://github.com/malignantz/lockuppdfs.com';
</script>

<svelte:head>
	<title>How your files stay on this device · {SITE_HOST}</title>
	<meta
		name="description"
		content="How {SITE_HOST} keeps your files on your device, and how to check it yourself."
	/>
</svelte:head>

<article class="page">
	<header>
		<p class="kicker"><Icon name="shield-check" size={18} /> Privacy</p>
		<h1>Your files stay on this device</h1>
		<p class="lede">
			Everything this site does to a PDF happens inside your browser. There is no upload step, no server that
			receives your files, and no account. Here is how that is enforced, and how you can check it.
		</p>
	</header>

	<section>
		<h2>How it is enforced</h2>
		<ul class="points">
			<li>
				<strong>The browser blocks outside connections.</strong>
				Every page is sent with a Content-Security-Policy that includes <code>connect-src 'self'</code>
				and <code>default-src 'self'</code>. Your browser refuses any attempt by this page to contact another
				server, even if the code tried to.
			</li>
			<li>
				<strong>Nothing comes from elsewhere.</strong> The PDF engines (qpdf, PDF.js, pdf-lib, MuPDF), fonts and
				icons are part of the site itself, and so is the text reader (Tesseract) that reads scanned pages
				so their text can be selected and made searchable, which runs on your computer like everything else. There is no CDN, no web font service and no
				third-party script.
			</li>
			{#if campaign}
				<li id="visits">
					<strong>Visits are counted. Files are not.</strong> When a page of this site loads, our server notes, in a
					visit counter we host ourselves, which page it was, the site that linked here, the source tag on the link you followed if it had one (for
					example, which post it was shared in), your country and rough area (region and city), your browser's
					language, and the kind of browser and device, so we can see how many people come. Your IP address is used once to work out where you are and to tell one visitor from another
					within a calendar month, and is not kept. There are no cookies and no analytics script in the page, and
					nothing about the files you open ever reaches the server.
				</li>
			{:else}
				<li>
					<strong>No analytics, no tracking.</strong> No cookies, no analytics script, no telemetry. The site does
					not know who you are or what you opened.
				</li>
			{/if}
			<li>
				<strong>It works offline.</strong> After the first visit the app is stored on your device and runs with
				no connection at all.
			</li>
			<li>
				<strong>The code is open.</strong> The full source is public under the AGPL-3.0 license:
				<a href={repo} rel="noreferrer">{repo.replace('https://', '')}</a>.
			</li>
		</ul>
	</section>

	<section>
		<h2>What is kept on this device</h2>
		<p class="para">
			So you can come back to your work, the files you open and your changes are saved in this browser, on this
			device only. They are never sent anywhere. Home shows each piece of work as a card with a small picture of
			its first page; up to 12 are kept, and one is open at a time.
		</p>
		<ul class="points">
			<li>
				<strong>Deleted 7 days after its last change</strong>, each piece of work on its own, and at once when you
				forget it from its card, choose Forget all my work or Start over, or turn off “Keep my work on this device”
				(under Settings).
			</li>
			<li>
				<strong>Nothing is deleted to make room.</strong> When the device is out of room, or 12 pieces of work are
				kept already, the app says the open work is not being saved and lets you choose what to forget.
			</li>
			<li>
				<strong>Text read from scanned pages</strong> (when the app reads the words in a scan, so you can select,
				find or make them searchable) is kept with your saved work, so no page is read twice, and is deleted with it.
				It holds the words and where they sit on the page, never a picture of the page.
			</li>
			<li>
				<strong>Words you mark for blackout from Find</strong> are kept with that piece of work, so every export can
				check they are gone, and are deleted with it.
			</li>
			<li>
				<strong>Passwords are never kept.</strong> A file you opened with a password is kept as you gave it, still
				locked, and asks for the password again.
			</li>
			<li>
				<strong>Passwords are never guessed.</strong> A file that needs a password to open still needs that
				password here; the app never guesses or gets around one. Once a file is open, limits it sets on printing or
				copying are not carried into your export.
			</li>
			<li>
				<strong>Private windows</strong> keep nothing once closed. Some browsers, Safari among them, may also clear
				it when the site has not been used for a while.
			</li>
		</ul>
	</section>

	{#if campaign}
		<section id="donation-links">
			<h2>The donation link</h2>
			<p class="para">
				After you save a file, this site shows a short note with one link to a fundraiser on a charity's own donation site.
			</p>
			<ul class="points">
				<li>
					<strong>It is an ordinary link.</strong> It passes through this site's own address <code>/give</code>,
					which sends you on to the charity's own donation site, and your browser opens it only if you choose to
					follow it. Nothing is loaded from the charity beforehand.
				</li>
				<li>
					<strong>No money and no data pass through this site.</strong> Any gift is made on the charity's own site,
					under that charity's own terms.
				</li>
				<li>
					<strong>The fundraiser is a supporter's own, not run by the charity.</strong>
				</li>
				<li>
					<strong>Clicks on the link are counted. Gifts are not.</strong> When you follow the link, our server adds
					one click to the visit counter, with the same details as a page visit. This site cannot see whether you
					gave, or how much. In your browser, the only thing remembered is that you closed the note, and only until
					you close this tab.
				</li>
			</ul>
		</section>
	{/if}

	<section>
		<h2>Check it yourself</h2>
		<ol class="steps">
			<li>
				<strong>Watch the network.</strong> Open your browser's developer tools (F12, or right-click and choose
				Inspect), select the <em>Network</em> tab, then add and export a file. Every request goes to
				<code>{SITE_HOST}</code>, and none of them carry your file.
			</li>
			<li>
				<strong>Turn the network off.</strong> Load the site once, then switch on airplane mode or unplug. Open a
				file, edit it and export it. It all still works, because nothing needs a server.
			</li>
			<li>
				<strong>Read the policy.</strong> In the Network tab, select the first request and look at the
				<code>content-security-policy</code> response header.
			</li>
		</ol>
	</section>

	<p class="back"><a href="/">Back to the workspace</a></p>
</article>

<style>
	.page {
		max-width: 40rem;
		margin: 0 auto;
		padding: var(--s-7) calc(var(--s-4) + var(--safe-right)) calc(var(--s-7) + var(--safe-bottom))
			calc(var(--s-4) + var(--safe-left));
	}

	header {
		margin-bottom: var(--s-6);
	}

	.kicker {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		margin-bottom: var(--s-3);
		color: var(--ok);
		font-size: var(--text-caption);
		font-weight: 600;
	}

	h1 {
		font-family: var(--font-serif);
		font-weight: 500;
		font-size: clamp(1.875rem, 1.4rem + 2vw, 2.5rem);
		letter-spacing: -0.012em;
		line-height: 1.12;
	}

	.lede {
		margin-top: var(--s-4);
		font-size: 1.0625rem;
		color: var(--ink-soft);
	}

	section {
		margin-top: var(--s-6);
		padding-top: var(--s-5);
		border-top: 1px solid var(--line);
	}

	h2 {
		font-size: 1.0625rem;
		margin-bottom: var(--s-4);
	}

	.para {
		margin-bottom: var(--s-4);
	}

	ul,
	ol {
		padding: 0;
		list-style: none;
		display: grid;
		gap: var(--s-4);
	}

	li {
		position: relative;
		padding-left: var(--s-5);
	}

	.points li::before {
		content: '';
		position: absolute;
		left: 4px;
		top: 0.62em;
		width: 6px;
		height: 6px;
		border-radius: 50%;
		background: var(--ink-soft);
	}

	.steps {
		counter-reset: step;
	}

	.steps li {
		counter-increment: step;
		padding-left: var(--s-6);
	}

	.steps li::before {
		content: counter(step);
		position: absolute;
		left: 0;
		top: 0.1em;
		display: grid;
		place-items: center;
		width: 22px;
		height: 22px;
		border-radius: 50%;
		border: 1px solid var(--line-strong);
		font-size: var(--text-caption);
		font-weight: 600;
		font-variant-numeric: tabular-nums;
		line-height: 1;
	}

	strong {
		font-weight: 600;
	}

	code {
		font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
		font-size: 0.875em;
		padding: 1px 5px;
		border-radius: 4px;
		background: var(--desk-deep);
		white-space: nowrap;
	}

	a {
		overflow-wrap: anywhere;
	}

	.back {
		margin-top: var(--s-7);
		font-size: var(--text-control);
	}
</style>
