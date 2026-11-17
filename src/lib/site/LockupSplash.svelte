<script lang="ts">
	import type { Snippet } from 'svelte';
	import Icon from '../ui/Icon.svelte';
	import type { IconName } from '../ui/icons';
	import BookingPhoto from './BookingPhoto.svelte';
	import type { Campaign } from './site';

	/**
	 * The campaign build's start page ("Booking photo"): a booking photo of a PDF, the
	 * headline, the one button, the giving band as an evidence tag, then the same tool list
	 * as the plain site, set as a rap sheet. EmptyDesk renders this instead of its own
	 * content on the LockUpPDFs build and keeps the drag-and-drop handling; this component
	 * only shows it.
	 */
	interface Props {
		campaign: Campaign;
		onfiles: (files: File[]) => void;
		accept: string;
		dragging: boolean;
		features: { icon: IconName; title: string; line: string }[];
		first: number;
		top?: Snippet;
		newWork?: string;
	}

	let { campaign, onfiles, accept, dragging, features, first, top, newWork }: Props = $props();
	const splash = $derived(campaign.splash);

	let more = $state(typeof matchMedia === 'function' && matchMedia('(min-width: 760px) and (min-height: 760px)').matches);
	const shown = $derived(more ? features : features.slice(0, first));

	let input: HTMLInputElement | undefined = $state();

	// The top tools as chips under the button, with the icon of the matching list entry.
	const PICTURES = 'image/png,image/jpeg,image/webp,image/gif,image/heic,image/*';
	const PDFS = 'application/pdf,.pdf';
	const chips = $derived(
		splash.chips.map((c) => ({ ...c, icon: features.find((f) => f.title === c.tool)?.icon ?? ('file' as IconName) }))
	);

	/** Opens the picker; a chip narrows it to the files its tool starts from. */
	function pick(only?: string) {
		if (!input) return;
		input.accept = only ?? accept;
		input.click();
	}

	function onchange() {
		const files = [...(input?.files ?? [])];
		if (input) {
			input.value = '';
			input.accept = accept;
		}
		if (files.length) onfiles(files);
	}

	const pad = (n: number) => String(n).padStart(2, '0');
</script>

<section class="lk lockup-theme" class:dragging aria-labelledby="empty-title">
	<div class="hero">
		<figure class="photo">
			<BookingPhoto label={splash.photoLabel} placard={splash.placard} />
		</figure>

		<div class="copy">
			<h1 id="empty-title" class="headline">
				{#if dragging}
					<span class="l1">{splash.dropping}</span>
				{:else}
					<span class="l1">{splash.headline[0]}</span>{' '}<span class="l2"><span>{splash.headline[1]}</span></span>
				{/if}
			</h1>
			<p class="statement">{splash.statement}</p>
			<div class="cta">
				<button type="button" class="choose" onclick={() => pick()}>
					<Icon name="add" size={26} />Choose files
				</button>
				<span class="drop-hint">{splash.drop}</span>
				<input
					bind:this={input}
					class="visually-hidden"
					type="file"
					multiple
					{accept}
					tabindex="-1"
					aria-hidden="true"
					{onchange}
				/>
			</div>
			<ul class="chips" aria-label="Popular tools">
				{#each chips as c (c.label)}
					<li>
						<button type="button" class="tool" title={c.tool} onclick={() => pick(c.pictures ? PICTURES : PDFS)}
							><Icon name={c.icon} size={18} />{c.label}</button
						>
					</li>
				{/each}
			</ul>
			{#if newWork}<p class="new-work">{newWork}</p>{/if}
			<p class="proof-line"><Icon name="shield-check" size={16} />{splash.proof}</p>
		</div>
	</div>

	<aside class="give" aria-labelledby="give-heading">
		<div class="give-head">
			<span class="tag">{splash.give.tag}</span>
			<h2 id="give-heading" class="give-heading">{splash.give.heading}</h2>
		</div>
		<div class="give-body">
			<p class="give-lead">{splash.give.lead}</p>
			<ul class="give-links">
				{#each campaign.ask.links as link (link.href)}
					<li>
						<a href={link.href} target="_blank" rel="noopener noreferrer"
							>{link.label}<svg class="ext" width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" focusable="false"
								><path d="M5 3h8v8M13 3 3.5 12.5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="square" /></svg
							></a
						>
					</li>
				{/each}
			</ul>
			<p class="give-note">{campaign.ask.note}</p>
		</div>
	</aside>

	{#if top}<div class="work">{@render top()}</div>{/if}

	<section class="record" aria-labelledby="what-title">
		<div class="record-head">
			<span class="tag">{splash.rapSheet}</span>
			<h2 id="what-title" class="what">What you can do</h2>
		</div>
		<ol class="counts" id="features">
			{#each shown as f, i (f.title)}
				<li>
					<span class="count" aria-hidden="true"><span>{splash.count}</span>{pad(i + 1)}</span>
					<span class="ftext"><strong>{f.title}</strong><span>{f.line}</span></span>
				</li>
			{/each}
		</ol>
		<button type="button" class="more" class:open={more} aria-expanded={more} aria-controls="features" onclick={() => (more = !more)}>
			<Icon name="chevron-right" size={18} />More it can do
		</button>
	</section>

	<footer class="foot">
		<p class="once">Add a file to start. Everything is in one place, and you download once at the end.</p>
		<p class="proof">
			<Icon name="shield-check" size={18} />Files stay on this device. This page cannot send them anywhere.
			<a href="/privacy">How that is enforced</a>
		</p>
	</footer>
</section>

<style>
	/*
	 * One column of content, 72rem at most, with the same gutter everywhere, so every
	 * section starts on the same left edge. Rhythm between sections: 48, 64, 48.
	 */
	.lk {
		--gutter: 16px;
		--col: 72rem;
		position: relative;
		min-height: calc(100dvh - var(--bar-h) - var(--safe-top));
		padding: 0 0 calc(var(--s-7) + var(--safe-bottom));
		background: var(--lk-paper);
		color: var(--lk-ink);
		overflow-x: clip;
	}

	.hero,
	.give,
	.work,
	.record,
	.foot {
		max-width: calc(var(--col) + 2 * var(--gutter));
		margin-inline: auto;
		padding-inline: calc(var(--gutter) + var(--safe-left)) calc(var(--gutter) + var(--safe-right));
	}

	/* Drag-over: an ink dashed frame round the window. */
	.lk::after {
		content: '';
		position: fixed;
		inset: calc(var(--bar-h) + var(--safe-top) + var(--s-2)) var(--s-2) var(--s-2);
		border: 3px dashed transparent;
		border-radius: 4px;
		pointer-events: none;
		z-index: 5;
		transition: border-color var(--dur) var(--ease);
	}

	.dragging::after {
		border-color: var(--lk-ink);
	}

	/* Small orange labels: the evidence tag and the rap sheet's. */
	.tag {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		align-self: flex-start;
		padding: 4px 10px 3px 13px;
		clip-path: polygon(9px 0, 100% 0, 100% 100%, 9px 100%, 0 50%);
		background: var(--lk-orange);
		color: var(--lk-ink);
		font-family: var(--font-display);
		font-size: 1rem;
		line-height: 1;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		white-space: nowrap;
	}

	/* The punched hole a tag's string goes through. */
	.tag::before {
		content: '';
		width: 5px;
		height: 5px;
		border-radius: 50%;
		background: var(--lk-ink);
	}

	/* ---------- Hero ---------- */

	.hero {
		display: grid;
		grid-template-areas: 'photo' 'copy';
		padding-inline: 0;
	}

	.photo {
		grid-area: photo;
		position: relative;
		margin: 0;
		background: var(--lk-wall);
		border-bottom: 3px solid var(--lk-ink);
		overflow: hidden;
	}

	/* The camera flash, once. */
	.photo::after {
		content: '';
		position: absolute;
		inset: 0;
		background: #fff;
		opacity: 0;
		pointer-events: none;
		animation: flash 650ms ease-out 1;
	}

	@keyframes flash {
		0% {
			opacity: 0.9;
		}
		100% {
			opacity: 0;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.photo::after {
			animation: none;
		}
	}

	.copy {
		grid-area: copy;
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		padding: var(--s-4) calc(var(--gutter) + var(--safe-right)) 0 calc(var(--gutter) + var(--safe-left));
	}

	.headline {
		font-family: var(--font-display);
		font-weight: 400;
		font-size: clamp(2.75rem, 12.4vw, 6.5rem);
		line-height: 0.9;
		letter-spacing: 0.005em;
		text-transform: uppercase;
		color: var(--lk-ink);
	}

	.l1,
	.l2 {
		display: block;
	}

	.l2 > span {
		display: inline-block;
		margin-top: 0.05em;
		margin-left: -0.06em;
		padding: 0.05em 0.12em 0.01em;
		background: var(--lk-orange);
		box-shadow: 0.06em 0.06em 0 var(--lk-ink);
		transform: rotate(-1.2deg);
		transform-origin: left center;
	}

	/* What the site is: plain, large and black, right above the button. */
	.statement {
		margin-top: var(--s-4);
		max-width: 24ch;
		font-size: clamp(1.1875rem, 5.2vw, 1.625rem);
		line-height: 1.2;
		font-weight: 800;
		letter-spacing: -0.01em;
		color: var(--lk-ink);
		text-wrap: balance;
	}

	/* The one action. Police-tape yellow is used nowhere else on the page. */
	.cta {
		margin-top: var(--s-4);
		width: 100%;
		display: flex;
		flex-direction: column;
		align-items: stretch;
		gap: var(--s-2);
	}

	.choose {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: var(--s-2);
		width: 100%;
		min-height: 64px;
		padding: 0 var(--s-6) 0 var(--s-5);
		border: 3px solid var(--lk-ink);
		border-radius: 4px;
		background: var(--lk-yellow);
		color: var(--lk-ink);
		font-size: 1.375rem;
		font-weight: 850;
		letter-spacing: -0.005em;
		box-shadow: 5px 5px 0 var(--lk-ink);
		transition:
			transform var(--dur-fast) var(--ease),
			box-shadow var(--dur-fast) var(--ease);
	}

	.choose:hover {
		transform: translate(-1px, -1px);
		box-shadow: 6px 6px 0 var(--lk-ink);
	}

	.choose:active {
		transform: translate(4px, 4px);
		box-shadow: 1px 1px 0 var(--lk-ink);
	}

	.choose:focus-visible {
		outline: 4px solid var(--lk-ink);
		outline-offset: 5px;
	}

	.choose :global(.icon) {
		stroke-width: 2.8;
	}

	/* Only where a pointer can drop files: the button sits in a drawn drop area. */
	.drop-hint {
		display: none;
	}

	@media (hover: hover) and (pointer: fine) {
		.cta {
			align-items: center;
			gap: var(--s-3);
			padding: var(--s-4);
			border: 2px dashed color-mix(in srgb, var(--lk-ink) 50%, transparent);
			border-radius: 6px;
		}

		.dragging .cta {
			border-style: solid;
			border-color: var(--lk-ink);
		}

		.drop-hint {
			display: inline;
			font-size: 1rem;
			font-weight: 650;
			color: var(--lk-soft);
		}
	}

	@media (hover: hover) and (pointer: fine) and (min-width: 600px) {
		.cta {
			flex-direction: row;
			width: auto;
			gap: var(--s-5);
			padding-right: var(--s-5);
		}

		.choose {
			width: auto;
		}

		.drop-hint {
			padding-right: var(--s-1);
		}
	}

	/* The top tools, under the button. */
	.chips {
		display: flex;
		flex-wrap: wrap;
		gap: var(--s-2);
		margin: var(--s-5) 0 0;
		padding: 0;
		list-style: none;
	}

	.tool {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		min-height: 40px;
		padding: 0 var(--s-3) 0 10px;
		border: 1.5px solid color-mix(in srgb, var(--lk-ink) 35%, transparent);
		border-radius: 999px;
		background: var(--lk-card);
		color: var(--lk-ink);
		font-size: 0.9375rem;
		font-weight: 700;
		white-space: nowrap;
		transition:
			border-color var(--dur-fast) var(--ease),
			background-color var(--dur-fast) var(--ease);
	}

	.tool:hover {
		border-color: var(--lk-ink);
		background: #fff;
	}

	.tool :global(.icon) {
		color: var(--lk-soft);
	}

	.new-work {
		margin-top: var(--s-3);
		font-size: var(--text-caption);
		color: var(--lk-soft);
	}

	.proof-line {
		margin-top: var(--s-3);
		text-wrap: balance;
		font-size: var(--text-caption);
		font-weight: 600;
		color: var(--lk-soft);
	}

	.proof-line :global(.icon) {
		display: inline-block;
		margin-right: 6px;
		vertical-align: -3px;
		color: var(--ok);
	}

	/* ---------- Giving band: an evidence tag ---------- */

	.give {
		display: grid;
		margin-top: var(--s-6);
		filter: drop-shadow(6px 6px 0 var(--lk-ink));
	}

	.give-head,
	.give-body {
		border: 3px solid var(--lk-ink);
	}

	.give-head {
		display: flex;
		flex-direction: column;
		gap: var(--s-3);
		padding: var(--s-4);
		background: var(--lk-ink);
		color: var(--lk-card);
	}

	.give-heading {
		font-family: var(--font-display);
		font-weight: 400;
		font-size: clamp(1.625rem, 7.4vw, 2.25rem);
		line-height: 1;
		letter-spacing: 0.01em;
		text-transform: uppercase;
		text-wrap: balance;
	}

	.give-body {
		display: grid;
		gap: var(--s-4);
		padding: var(--s-4);
		border-top: 0;
		background: var(--lk-card);
	}

	.give-lead {
		font-size: 1.0625rem;
		line-height: 1.45;
		font-weight: 600;
		text-wrap: pretty;
	}

	.give-links {
		display: flex;
		flex-wrap: wrap;
		gap: var(--s-3);
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.give-links li {
		flex: 1 1 12rem;
	}

	.give-links a {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: var(--s-2);
		min-height: 52px;
		padding: 0 var(--s-4);
		border-radius: 4px;
		background: var(--lk-ink);
		color: var(--lk-card);
		font-weight: 800;
		font-size: 1.0625rem;
		text-decoration: none;
		transition: background-color var(--dur-fast) var(--ease);
	}

	.give-links a:hover {
		background: #2e2c29;
	}

	.give-note {
		font-size: var(--text-caption);
		line-height: 1.5;
		color: var(--lk-soft);
	}

	/* ---------- Home cards, when there is saved work ---------- */

	.work {
		margin-top: var(--s-7);
	}

	/* ---------- Rap sheet: the tool list ---------- */

	.record {
		margin-top: 64px;
	}

	.record-head {
		display: flex;
		flex-direction: column;
		gap: var(--s-2);
		padding-bottom: var(--s-3);
		border-bottom: 3px solid var(--lk-ink);
	}

	.what {
		font-family: var(--font-display);
		font-weight: 400;
		font-size: clamp(2rem, 9vw, 2.75rem);
		line-height: 1;
		letter-spacing: 0.01em;
		text-transform: uppercase;
	}

	.counts {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		grid-template-columns: minmax(0, 1fr);
		column-gap: var(--s-6);
	}

	.counts li {
		display: grid;
		grid-template-columns: 3.25rem minmax(0, 1fr);
		gap: var(--s-3);
		align-items: start;
		padding: var(--s-4) 0;
		border-bottom: 1px solid var(--lk-line);
	}

	.count {
		display: flex;
		flex-direction: column;
		font-family: var(--font-display);
		font-size: 1.875rem;
		line-height: 1;
		color: var(--lk-ink);
	}

	.count span {
		margin-bottom: 3px;
		font-family: var(--font-sans);
		font-size: 0.625rem;
		font-weight: 700;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		color: var(--lk-soft);
	}

	.ftext {
		display: flex;
		flex-direction: column;
		gap: 2px;
		padding-top: 1px;
		font-size: var(--text-control);
		line-height: 1.45;
		color: var(--lk-soft);
	}

	.ftext strong {
		font-size: 1.0625rem;
		font-weight: 750;
		color: var(--lk-ink);
	}

	.more {
		display: inline-flex;
		align-items: center;
		gap: var(--s-1);
		min-height: 48px;
		margin-top: var(--s-5);
		padding: 0 var(--s-4) 0 var(--s-3);
		border: 2px solid var(--lk-ink);
		border-radius: 4px;
		background: var(--lk-card);
		font-size: var(--text-control);
		font-weight: 750;
		color: var(--lk-ink);
	}

	.more:hover {
		background: #fff;
	}

	.more > :global(.icon) {
		transition: transform var(--dur) var(--ease);
	}

	.more.open > :global(.icon) {
		transform: rotate(90deg);
	}

	/* ---------- Footer lines ---------- */

	.foot {
		margin-top: var(--s-7);
	}

	.foot > * {
		max-width: 44rem;
	}

	.once {
		padding-top: var(--s-4);
		border-top: 1px solid var(--lk-line);
		max-width: none;
		font-size: var(--text-control);
		color: var(--lk-ink);
	}

	.proof {
		margin-top: var(--s-2);
		font-size: var(--text-caption);
		line-height: 1.6;
		color: var(--lk-soft);
	}

	.proof :global(.icon) {
		display: inline-block;
		color: var(--ok);
		vertical-align: -4px;
		margin-right: 4px;
	}

	.proof a {
		color: var(--lk-ink);
		font-weight: 700;
		white-space: nowrap;
	}

	/* ---------- Medium: the tool list in two columns ---------- */

	@media (min-width: 700px) {
		.lk {
			--gutter: 32px;
		}

		.counts {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}

		.record-head {
			flex-direction: row;
			align-items: center;
			gap: var(--s-4);
		}

		.record-head .tag {
			align-self: center;
		}
	}

	/* ---------- Wide: text left, the photo beside it as a print ---------- */

	@media (min-width: 900px) {
		.hero {
			grid-template-columns: minmax(0, 1.25fr) minmax(0, 1fr);
			grid-template-areas: 'copy photo';
			align-items: center;
			column-gap: var(--s-7);
			padding: var(--s-7) calc(var(--gutter) + var(--safe-right)) 0 calc(var(--gutter) + var(--safe-left));
		}

		.copy {
			padding: 0;
		}

		.photo {
			border: 3px solid var(--lk-ink);
			box-shadow: 10px 10px 0 var(--lk-ink);
			transform: rotate(1deg);
		}

		.headline {
			font-size: clamp(4.5rem, 7.6vw, 6.75rem);
		}

		.statement {
			margin-top: var(--s-5);
			max-width: 22ch;
		}

		/* The drop area runs the width of the column: a real target, and a clean right edge. */
		.cta {
			margin-top: var(--s-5);
			align-self: stretch;
		}

		.chips {
			gap: 6px;
		}

		.tool {
			padding: 0 11px 0 9px;
			font-size: 0.90625rem;
		}

		.give {
			grid-template-columns: minmax(0, 20rem) minmax(0, 1fr);
			margin-top: 72px;
		}

		.give-head {
			justify-content: center;
			padding: var(--s-5);
		}

		.give-body {
			grid-template-columns: minmax(0, 1fr) auto;
			column-gap: var(--s-6);
			align-items: center;
			padding: var(--s-5) var(--s-6);
			border-top: 3px solid var(--lk-ink);
			border-left: 0;
		}

		.give-lead,
		.give-note {
			grid-column: 1;
		}

		.give-links {
			grid-column: 2;
			grid-row: 1 / span 2;
			flex-direction: column;
			width: 13rem;
		}

		.give-links li {
			flex: none;
		}

		.give {
			filter: drop-shadow(8px 8px 0 var(--lk-ink));
		}

		.record {
			margin-top: 80px;
		}
	}

	@media (min-width: 1080px) {
		.counts {
			grid-template-columns: repeat(3, minmax(0, 1fr));
		}
	}

	@media (max-width: 359px) {
		.lk {
			--gutter: 12px;
		}

		.choose {
			padding: 0 var(--s-5) 0 var(--s-4);
		}

		/* Two even columns rather than a ragged wrap. */
		.chips {
			display: grid;
			grid-template-columns: repeat(2, minmax(0, 1fr));
			gap: 6px;
			width: 100%;
		}

		.tool {
			width: 100%;
			justify-content: center;
			gap: 4px;
			padding: 0 6px;
			font-size: 0.8125rem;
		}
	}
</style>
