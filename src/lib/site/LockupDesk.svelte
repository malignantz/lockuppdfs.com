<script lang="ts">
	import type { Snippet } from 'svelte';
	import Icon from '../ui/Icon.svelte';
	import { features, FIRST } from '../ui/features';
	import BookingPhoto from './BookingPhoto.svelte';
	import { campaign } from './site';
	import './lockup.css';

	/**
	 * The campaign build's start page (LockUpPDFs). Same job as ui/EmptyDesk: the whole
	 * window is the drop target while it is mounted, and "Choose files" opens the picker.
	 * On top of that it carries the joke (a booking photo of a PDF) and the giving band.
	 */
	interface Props {
		onfiles: (files: File[]) => void;
		accept?: string;
		top?: Snippet;
		newWork?: string;
	}

	let { onfiles, accept = 'application/pdf,.pdf,image/png,image/jpeg,image/webp,image/gif,image/heic,image/*', top, newWork }: Props =
		$props();

	const c = campaign!;
	const s = c.splash;

	let more = $state(typeof matchMedia === 'function' && matchMedia('(min-width: 760px) and (min-height: 760px)').matches);
	const shown = $derived(more ? features : features.slice(0, FIRST));

	let input: HTMLInputElement | undefined = $state();
	let dragging = $state(false);
	let depth = 0;

	const hasFiles = (e: DragEvent) => !!e.dataTransfer && [...e.dataTransfer.types].includes('Files');

	function ondragenter(e: DragEvent) {
		if (!hasFiles(e)) return;
		e.preventDefault();
		depth++;
		dragging = true;
	}

	function ondragover(e: DragEvent) {
		if (!hasFiles(e)) return;
		e.preventDefault();
		if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
	}

	function ondragleave(e: DragEvent) {
		if (!hasFiles(e)) return;
		depth = Math.max(0, depth - 1);
		if (depth === 0) dragging = false;
	}

	function ondrop(e: DragEvent) {
		if (!hasFiles(e)) return;
		e.preventDefault();
		depth = 0;
		dragging = false;
		const files = [...(e.dataTransfer?.files ?? [])];
		if (files.length) onfiles(files);
	}

	function onchange() {
		const files = [...(input?.files ?? [])];
		if (input) input.value = '';
		if (files.length) onfiles(files);
	}

	const pad = (n: number) => String(n).padStart(2, '0');
</script>

<svelte:window {ondragenter} {ondragover} {ondragleave} {ondrop} />

<section class="lk" class:dragging aria-labelledby="empty-title">
	{#if top}<div class="top">{@render top()}</div>{/if}

	<div class="hero" class:returning={!!newWork}>
		<figure class="photo">
			<BookingPhoto label={s.photoLabel} placard={s.placard} />
		</figure>

		<div class="copy">
			<h1 id="empty-title" class="headline">
				{#if dragging}
					<span class="l1">Drop to add them</span>
				{:else}
					<span class="l1">{s.headline[0]}</span>
					<span class="l2"><span>{s.headline[1]}</span></span>
				{/if}
			</h1>
			<p class="sub">{s.sub}</p>

			<div class="cta">
				<button type="button" class="choose" onclick={() => input?.click()}>
					<Icon name="add" size={22} />Choose files
				</button>
				<span class="drop-hint">or drop them anywhere on this page</span>
				{#if newWork}<p class="new-work">{newWork}</p>{/if}
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
		</div>
	</div>

	<section class="give" aria-labelledby="give-title">
		<div class="give-head">
			<span class="exhibit">{s.give.tag}</span>
			<h2 id="give-title">{s.give.heading}</h2>
		</div>
		<div class="give-body">
			<p class="give-lead">{s.give.lead}</p>
			<ul class="give-links">
				{#each c.ask.links as link (link.href)}
					<li>
						<a href={link.href} target="_blank" rel="noopener noreferrer"
							>{link.label}<svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true" focusable="false"
								><path d="M7 4.5h8.5V13M15.5 4.5 4.5 15.5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="square" /></svg
							></a
						>
					</li>
				{/each}
			</ul>
			<p class="give-note">{c.ask.note}</p>
		</div>
	</section>

	<section class="record" aria-labelledby="what-title">
		<div class="record-head">
			<p class="eyebrow">{s.rapSheet}</p>
			<h2 id="what-title">What you can do</h2>
		</div>
		<ol class="counts" id="features">
			{#each shown as f, i (f.title)}
				<li>
					<span class="count" aria-hidden="true"><span>{s.count}</span>{pad(i + 1)}</span>
					<Icon name={f.icon} size={22} />
					<span class="ftext"><strong>{f.title}</strong><span>{f.line}</span></span>
				</li>
			{/each}
		</ol>
		<button type="button" class="more" class:open={more} aria-expanded={more} aria-controls="features" onclick={() => (more = !more)}>
			<Icon name="chevron-right" size={18} />More it can do
		</button>
	</section>

	<p class="once">Add a file to start. Everything is in one place, and you download once at the end.</p>

	<p class="proof">
		<Icon name="shield-check" size={18} />Files stay on this device. This page cannot send them anywhere.
		<a href="/privacy">How that is enforced</a>
	</p>
</section>

<style>
	.lk {
		position: relative;
		min-height: calc(100dvh - var(--bar-h) - var(--safe-top));
		padding: 0 0 calc(var(--s-6) + var(--safe-bottom));
		background: var(--lk-bg);
		color: var(--lk-ink);
	}

	/* Drag-over: an orange dashed edge round the whole page. */
	.lk::after {
		content: '';
		position: fixed;
		inset: calc(var(--bar-h) + var(--safe-top) + var(--s-3)) var(--s-3) var(--s-3);
		border: 3px dashed transparent;
		border-radius: 4px;
		pointer-events: none;
		z-index: 5;
		transition: border-color var(--dur) var(--ease);
	}

	.dragging::after {
		border-color: var(--lk-orange);
	}

	.top {
		max-width: 72rem;
		margin: 0 auto;
		padding: 0 calc(var(--s-4) + var(--safe-right)) 0 calc(var(--s-4) + var(--safe-left));
	}

	.top:has(> :global(*)) {
		padding-top: var(--s-4);
	}

	/* ---------- Hero ---------- */

	.hero {
		display: grid;
		grid-template-areas: 'photo' 'copy';
		max-width: 72rem;
		margin: 0 auto;
	}

	.photo {
		grid-area: photo;
		margin: 0;
		background: var(--lk-wall);
		border-bottom: 3px solid var(--lk-ink);
	}

	.copy {
		grid-area: copy;
		padding: var(--s-4) calc(var(--s-4) + var(--safe-right)) 0 calc(var(--s-4) + var(--safe-left));
	}

	.headline {
		font-family: var(--lk-display);
		font-weight: 400;
		font-size: clamp(3.25rem, 1.6rem + 7.2vw, 6.25rem);
		line-height: 0.92;
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
		margin-top: 0.06em;
		padding: 0.04em 0.12em 0.02em;
		margin-left: -0.04em;
		background: var(--lk-orange);
		color: var(--lk-orange-ink);
		box-shadow: 0.06em 0.06em 0 var(--lk-ink);
		transform: rotate(-1.2deg);
		transform-origin: left center;
	}

	.sub {
		margin-top: var(--s-3);
		max-width: 26rem;
		font-size: 1.125rem;
		font-weight: 600;
		line-height: 1.35;
		color: var(--lk-ink);
	}

	.cta {
		margin-top: var(--s-4);
		display: flex;
		align-items: center;
		gap: var(--s-3) var(--s-4);
		flex-wrap: wrap;
	}

	.choose {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: var(--s-2);
		min-height: 56px;
		padding: 0 var(--s-5) 0 var(--s-4);
		border: 3px solid var(--lk-ink);
		border-radius: 4px;
		background: var(--lk-orange);
		color: var(--lk-orange-ink);
		box-shadow: 4px 4px 0 var(--lk-ink);
		font-family: var(--lk-display);
		font-size: 1.375rem;
		letter-spacing: 0.04em;
		text-transform: uppercase;
		line-height: 1;
		cursor: pointer;
		transition:
			transform var(--dur-fast) var(--ease),
			box-shadow var(--dur-fast) var(--ease);
	}

	.choose:hover {
		transform: translate(-1px, -1px);
		box-shadow: 5px 5px 0 var(--lk-ink);
	}

	.choose:active {
		transform: translate(3px, 3px);
		box-shadow: 1px 1px 0 var(--lk-ink);
	}

	.drop-hint {
		font-size: var(--text-caption);
		color: var(--lk-soft);
	}

	.new-work {
		flex-basis: 100%;
		font-size: var(--text-caption);
		color: var(--lk-soft);
	}

	@media (hover: none) and (pointer: coarse) {
		.drop-hint {
			display: none;
		}
	}

	/* ---------- Giving band: an evidence tag ---------- */

	.give {
		position: relative;
		max-width: 72rem;
		margin: var(--s-5) calc(var(--s-4) + var(--safe-right)) 0 calc(var(--s-4) + var(--safe-left));
		border: 3px solid var(--lk-ink);
		border-radius: 4px;
		background: var(--lk-paper);
		box-shadow: 4px 4px 0 var(--lk-ink);
	}

	.give-head {
		display: flex;
		align-items: center;
		gap: var(--s-3);
		padding: var(--s-2) var(--s-4);
		background: var(--lk-ink);
		color: var(--lk-paper);
	}

	.exhibit {
		padding: 2px 7px 1px;
		background: var(--lk-orange);
		color: var(--lk-orange-ink);
		font-family: var(--lk-display);
		font-size: 0.9375rem;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		line-height: 1.2;
	}

	.give-head h2 {
		font-family: var(--lk-display);
		font-weight: 400;
		font-size: 1.25rem;
		letter-spacing: 0.04em;
		text-transform: uppercase;
		line-height: 1.2;
	}

	.give-body {
		display: grid;
		gap: var(--s-3);
		padding: var(--s-4);
	}

	.give-lead {
		font-size: 1.0625rem;
		font-weight: 500;
		line-height: 28px;
		text-wrap: pretty;
		/* Written on the ruled lines of a filled-in label. */
		background-image: repeating-linear-gradient(
			to bottom,
			transparent 0 26px,
			color-mix(in srgb, var(--lk-ink) 14%, transparent) 26px 27px,
			transparent 27px 28px
		);
	}

	.give-links {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: var(--s-3);
		padding: 0;
		margin: 0;
		list-style: none;
	}

	.give-links a {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 6px;
		min-height: 52px;
		padding: 0 var(--s-2);
		border: 3px solid var(--lk-ink);
		border-radius: 4px;
		background: var(--lk-ink);
		color: var(--lk-paper);
		white-space: nowrap;
		font-family: var(--lk-display);
		font-size: 1.125rem;
		letter-spacing: 0.04em;
		text-transform: uppercase;
		text-decoration: none;
		line-height: 1;
		text-align: center;
		transition: background-color var(--dur-fast) var(--ease), color var(--dur-fast) var(--ease);
	}

	.give-links a:hover {
		background: var(--lk-paper);
		color: var(--lk-ink);
	}

	.give-links svg {
		flex: none;
	}

	.give-note {
		font-size: var(--text-caption);
		line-height: 1.5;
		color: var(--lk-soft);
	}

	/* ---------- The tool list, as a rap sheet ---------- */

	.record {
		max-width: 72rem;
		margin: var(--s-7) auto 0;
		padding: 0 calc(var(--s-4) + var(--safe-right)) 0 calc(var(--s-4) + var(--safe-left));
	}

	.record-head {
		display: flex;
		align-items: baseline;
		flex-wrap: wrap;
		gap: var(--s-1) var(--s-3);
		padding-bottom: var(--s-2);
		border-bottom: 3px solid var(--lk-ink);
	}

	.eyebrow {
		font-family: var(--lk-display);
		font-size: 0.9375rem;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		padding: 1px 7px 0;
		background: var(--lk-orange);
		color: var(--lk-orange-ink);
	}

	.record h2 {
		font-family: var(--lk-display);
		font-weight: 400;
		font-size: 2rem;
		line-height: 1.05;
		text-transform: uppercase;
	}

	.counts {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		grid-template-columns: 1fr;
	}

	.counts li {
		display: grid;
		grid-template-columns: 3.25rem 22px minmax(0, 1fr);
		gap: var(--s-3);
		align-items: start;
		padding: var(--s-3) 0;
		border-bottom: 1px solid color-mix(in srgb, var(--lk-ink) 22%, transparent);
	}

	.count {
		display: grid;
		font-family: var(--lk-display);
		font-size: 1.5rem;
		line-height: 1;
		font-variant-numeric: tabular-nums;
	}

	.count > span {
		font-family: var(--font-sans);
		font-size: 0.625rem;
		font-weight: 700;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: var(--lk-soft);
		margin-bottom: 2px;
	}

	.counts li > :global(.icon) {
		margin-top: 2px;
		color: var(--lk-ink);
	}

	.ftext {
		display: grid;
		gap: 2px;
	}

	.ftext strong {
		font-size: var(--text-base);
		font-weight: 700;
	}

	.ftext span {
		font-size: var(--text-caption);
		line-height: 1.45;
		color: var(--lk-soft);
	}

	.more {
		display: inline-flex;
		align-items: center;
		gap: var(--s-1);
		min-height: 44px;
		margin-top: var(--s-3);
		padding: 0 var(--s-3) 0 var(--s-2);
		border: 2px solid var(--lk-ink);
		border-radius: 4px;
		background: transparent;
		color: var(--lk-ink);
		font-weight: 700;
		font-size: var(--text-control);
		cursor: pointer;
	}

	.more :global(.icon) {
		transition: transform var(--dur) var(--ease);
	}

	.more.open :global(.icon) {
		transform: rotate(90deg);
	}

	.more:hover {
		background: color-mix(in srgb, var(--lk-ink) 7%, transparent);
	}

	.once,
	.proof {
		max-width: 72rem;
		margin: var(--s-5) auto 0;
		padding: 0 calc(var(--s-4) + var(--safe-right)) 0 calc(var(--s-4) + var(--safe-left));
		font-size: var(--text-caption);
		color: var(--lk-soft);
	}

	.proof {
		margin-top: var(--s-2);
	}

	.proof > :global(.icon) {
		display: inline-block;
		vertical-align: -4px;
		margin-right: 4px;
		color: var(--lk-ink);
	}

	.proof a {
		color: var(--lk-ink);
		font-weight: 600;
		white-space: nowrap;
	}

	.choose:focus-visible,
	.give-links a:focus-visible,
	.more:focus-visible,
	.proof a:focus-visible {
		outline: 3px solid var(--lk-focus);
		outline-offset: 3px;
	}

	/* Returning visitors: their work cards lead, the photo steps back to a strip. */
	.returning .photo {
		display: none;
	}

	/* ---------- Wider screens ---------- */

	@media (min-width: 600px) {
		.photo {
			margin: var(--s-5) var(--s-5) 0;
			border: 3px solid var(--lk-ink);
			box-shadow: 6px 6px 0 var(--lk-ink);
		}

		.copy {
			padding-top: var(--s-5);
		}

		.give {
			margin-left: auto;
			margin-right: auto;
			width: calc(100% - 2 * var(--s-5));
			max-width: calc(72rem - 2 * var(--s-5));
		}

		.counts {
			grid-template-columns: repeat(2, minmax(0, 1fr));
			column-gap: var(--s-6);
		}
	}

	@media (min-width: 900px) {
		.lk {
			padding-top: var(--s-6);
		}

		.hero {
			grid-template-areas: 'copy photo';
			grid-template-columns: minmax(0, 1.05fr) minmax(0, 1fr);
			align-items: center;
			gap: var(--s-6);
			padding: 0 var(--s-6);
		}

		.photo {
			margin: 0;
			transform: rotate(1.2deg);
		}

		.copy {
			padding: 0;
		}

		.headline {
			font-size: clamp(5rem, 2rem + 5.6vw, 7.5rem);
		}

		.sub {
			font-size: 1.3125rem;
			margin-top: var(--s-4);
		}

		.cta {
			margin-top: var(--s-5);
		}

		.give {
			display: grid;
			grid-template-columns: 15rem minmax(0, 1fr);
			width: calc(100% - 2 * var(--s-6));
			max-width: calc(72rem - 2 * var(--s-6));
			margin-top: var(--s-6);
		}

		.give-head {
			flex-direction: column;
			align-items: flex-start;
			justify-content: center;
			gap: var(--s-2);
			padding: var(--s-4) var(--s-5);
		}

		.give-head h2 {
			font-size: 1.75rem;
			line-height: 1.02;
		}

		.give-body {
			grid-template-columns: minmax(0, 1fr) 23rem;
			align-items: center;
			column-gap: var(--s-5);
			padding: var(--s-4) var(--s-5);
		}

		.give-note {
			grid-column: 1 / -1;
		}

		.record,
		.once,
		.proof {
			padding-left: var(--s-6);
			padding-right: var(--s-6);
		}

		.counts {
			grid-template-columns: repeat(3, minmax(0, 1fr));
		}
	}

	@media (max-width: 374px) {
		.give-links {
			grid-template-columns: 1fr;
		}

		.give-head h2 {
			font-size: 1.0625rem;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.choose,
		.choose:hover,
		.choose:active {
			transition: none;
			transform: none;
		}
	}
</style>
