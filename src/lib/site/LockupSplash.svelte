<script lang="ts">
	/**
	 * The campaign build's start page ("Deadpan"): a straight-faced product hero that says
	 * the pun, the giving card, then the tool list. Rendered by EmptyDesk on the lockup build
	 * only; EmptyDesk keeps the drop target and the file picker. All wording is in site.ts.
	 * The giving links are plain links to each charity's own page: no script, no request.
	 */
	import type { Snippet } from 'svelte';
	import Button from '../ui/Button.svelte';
	import Icon from '../ui/Icon.svelte';
	import type { IconName } from '../ui/icons';
	import LockMark from './LockMark.svelte';
	import type { Campaign } from './site';

	interface Props {
		campaign: Campaign;
		features: { icon: IconName; title: string; line: string }[];
		/** How many tools are always shown; the rest fold under "More it can do". */
		first: number;
		more: boolean;
		dragging: boolean;
		top?: Snippet;
		newWork?: string;
		onchoose: () => void;
		/** The hidden file input, owned by EmptyDesk. */
		picker: Snippet;
	}

	let { campaign, features, first, more = $bindable(), dragging, top, newWork, onchoose, picker }: Props = $props();

	const splash = $derived(campaign.splash);
	const ask = $derived(campaign.ask);
	const shown = $derived(more ? features : features.slice(0, first));
</script>

{#snippet out()}
	<svg class="out" width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
		<path d="M5.5 4.5h6v6M11.25 4.75 4.5 11.5" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" />
	</svg>
{/snippet}

<section class="lu" class:dragging aria-labelledby="empty-title">
	{#if top}<div class="top">{@render top()}</div>{/if}

	<div class="hero">
		<div class="copy">
			<div class="art-phone"><LockMark size={72} click /></div>
			<p class="eyebrow"><span class="dot" aria-hidden="true"></span>Free PDF tools · runs on your device</p>
			<h1 id="empty-title" class="headline">{splash.headline}</h1>
			<p class="tagline">{splash.tagline}</p>
			<p class="body">{splash.body}</p>

			<div class="cta">
				<Button variant="primary" size="lg" icon="add" class="lu-choose" onclick={onchoose}>Choose files</Button>
				<span class="drop-hint">or drop them anywhere on this page</span>
				{#if newWork}<p class="new-work">{newWork}</p>{/if}
				{@render picker()}
			</div>
		</div>

		<div class="art" aria-hidden="true">
			<div class="halo"></div>
			<LockMark size={248} click />
		</div>
	</div>

	<aside class="give" aria-labelledby="give-title">
		<div class="give-copy">
			<h2 id="give-title" class="give-title">{splash.give.heading}</h2>
			<p class="give-lead">{splash.give.lead}</p>
		</div>
		<ul class="give-links">
			{#each ask.links as link (link.href)}
				<li>
					<a href={link.href} target="_blank" rel="noopener noreferrer">{link.label}{@render out()}</a>
				</li>
			{/each}
		</ul>
		<p class="give-note">{ask.note}</p>
	</aside>

	<section class="tools" aria-labelledby="tools-title">
		<h2 id="tools-title" class="tools-title">What you can do</h2>
		<p class="tools-sub">Add a file to start. Everything is in one place, and you download once at the end.</p>
		<ul class="grid" id="features">
			{#each shown as f (f.title)}
				<li class="card">
					<span class="ficon"><Icon name={f.icon} size={20} /></span>
					<span class="ftext"><strong>{f.title}</strong><span>{f.line}</span></span>
				</li>
			{/each}
		</ul>
		<button type="button" class="more" class:open={more} aria-expanded={more} aria-controls="features" onclick={() => (more = !more)}>
			<Icon name="chevron-right" size={18} />More it can do
		</button>
	</section>

	<p class="proof">
		<Icon name="shield-check" size={18} />Files stay on this device. This page cannot send them anywhere.
		<a href="/privacy">How that is enforced</a>
	</p>

	<div class="drop" aria-hidden="true"><span>Drop to add them</span></div>
</section>

<style>
	.lu {
		--gutter: max(16px, min(6vw, 48px));
		position: relative;
		display: flex;
		flex-direction: column;
		align-items: center;
		min-height: calc(100dvh - var(--bar-h) - var(--safe-top));
		padding: 0 calc(var(--gutter) + var(--safe-right)) calc(var(--s-6) + var(--safe-bottom)) calc(var(--gutter) + var(--safe-left));
		background:
			radial-gradient(60rem 36rem at 85% -10%, color-mix(in srgb, var(--accent) 9%, transparent), transparent 70%),
			var(--surface);
		color: var(--ink);
		font-family: var(--font-sans);
	}

	.top,
	.hero,
	.give,
	.tools,
	.proof {
		width: 100%;
		max-width: 68rem;
	}

	.top {
		padding-top: var(--s-5);
	}

	/* ---------- Hero ---------- */

	.hero {
		display: grid;
		grid-template-columns: minmax(0, 1fr);
		padding-top: var(--s-5);
	}

	.art {
		display: none;
	}

	.eyebrow {
		display: none;
	}

	.art-phone {
		margin-bottom: var(--s-4);
		filter: drop-shadow(0 10px 18px rgb(22 48 216 / 0.28));
	}

	.headline {
		font-family: var(--font-sans);
		font-weight: 700;
		font-size: clamp(2.5rem, 11.4vw, 5.75rem);
		line-height: 0.98;
		letter-spacing: -0.045em;
		color: var(--ink);
		text-wrap: nowrap;
	}

	.tagline {
		margin-top: var(--s-2);
		font-weight: 700;
		font-size: clamp(1.375rem, 5.6vw, 2.125rem);
		line-height: 1.15;
		letter-spacing: -0.03em;
		color: var(--accent);
	}

	.body {
		margin-top: var(--s-4);
		max-width: 34rem;
		font-size: 1.0625rem;
		line-height: 1.5;
		letter-spacing: -0.005em;
		color: var(--ink-soft);
	}

	.cta {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--s-3) var(--s-4);
		margin-top: var(--s-5);
	}

	.cta :global(.lu-choose) {
		min-height: 52px;
		padding: 0 var(--s-5) 0 var(--s-4);
		border-radius: 14px;
		font-size: 1.0625rem;
		font-weight: 700;
		letter-spacing: -0.01em;
		box-shadow:
			inset 0 1px 0 rgb(255 255 255 / 0.22),
			0 1px 2px rgb(11 13 18 / 0.18),
			0 8px 20px color-mix(in srgb, var(--accent) 32%, transparent);
		transition:
			transform var(--dur-fast) var(--ease),
			box-shadow var(--dur) var(--ease),
			background-color var(--dur-fast) var(--ease);
	}

	.cta :global(.lu-choose:hover) {
		transform: translateY(-1px);
	}

	.cta :global(.lu-choose:active) {
		transform: translateY(0);
	}

	.cta :global(.lu-choose:focus-visible) {
		outline: 3px solid color-mix(in srgb, var(--accent) 45%, transparent);
		outline-offset: 3px;
	}

	.drop-hint,
	.new-work {
		font-size: var(--text-caption);
		color: var(--ink-soft);
	}

	.new-work {
		flex-basis: 100%;
	}

	@media (hover: none) and (pointer: coarse), (max-width: 599px) {
		.drop-hint {
			display: none;
		}
	}

	/* ---------- Giving card ---------- */

	.give {
		display: grid;
		gap: var(--s-4);
		margin-top: var(--s-6);
		padding: var(--s-5) 20px;
		border: 1px solid var(--line);
		border-radius: 20px;
		background: var(--surface);
		box-shadow:
			0 1px 2px rgb(11 13 18 / 0.04),
			0 12px 32px -12px rgb(11 13 18 / 0.12);
	}

	.give-title {
		font-family: var(--font-sans);
		font-weight: 700;
		font-size: 1.375rem;
		line-height: 1.2;
		letter-spacing: -0.025em;
		color: var(--ink);
	}

	.give-lead {
		margin-top: var(--s-2);
		max-width: 36rem;
		font-size: var(--text-base);
		line-height: 1.5;
		color: var(--ink-soft);
	}

	.give-links {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(9.5rem, 1fr));
		gap: var(--s-2);
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.give-links a {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 6px;
		min-height: 48px;
		padding: 0 var(--s-4);
		border-radius: 12px;
		background: var(--lu-give);
		color: var(--lu-give-ink);
		font-size: var(--text-base);
		font-weight: 700;
		letter-spacing: -0.01em;
		text-decoration: none;
		white-space: nowrap;
		box-shadow:
			inset 0 1px 0 rgb(255 255 255 / 0.12),
			0 1px 2px rgb(11 13 18 / 0.2);
		transition:
			transform var(--dur-fast) var(--ease),
			background-color var(--dur-fast) var(--ease);
	}

	.give-links a:hover {
		background: color-mix(in srgb, var(--lu-give) 84%, var(--accent));
		transform: translateY(-1px);
	}

	.give-links a:focus-visible {
		outline: 3px solid var(--accent);
		outline-offset: 3px;
	}

	.out {
		flex: none;
		opacity: 0.8;
	}

	.give-note {
		font-size: var(--text-caption);
		line-height: 1.5;
		color: var(--ink-soft);
	}

	/* ---------- Tools ---------- */

	.tools {
		margin-top: var(--s-7);
	}

	.tools-title {
		font-family: var(--font-sans);
		font-weight: 700;
		font-size: clamp(1.625rem, 5vw, 2.25rem);
		line-height: 1.1;
		letter-spacing: -0.035em;
		color: var(--ink);
	}

	.tools-sub {
		margin-top: var(--s-2);
		max-width: 34rem;
		color: var(--ink-soft);
	}

	.grid {
		display: grid;
		grid-template-columns: minmax(0, 1fr);
		gap: var(--s-2);
		margin: var(--s-5) 0 0;
		padding: 0;
		list-style: none;
	}

	.card {
		display: flex;
		gap: var(--s-3);
		align-items: flex-start;
		padding: 14px var(--s-4) 14px 14px;
		border: 1px solid var(--line);
		border-radius: 16px;
		background: var(--surface);
		transition: border-color var(--dur) var(--ease), box-shadow var(--dur) var(--ease);
	}

	.card:hover {
		border-color: var(--lu-tint-line);
		box-shadow: 0 8px 24px -14px color-mix(in srgb, var(--accent) 40%, transparent);
	}

	.ficon {
		flex: none;
		display: grid;
		place-items: center;
		width: 40px;
		height: 40px;
		border-radius: 11px;
		background: var(--lu-tint);
		box-shadow: inset 0 0 0 1px var(--lu-tint-line);
		color: var(--accent);
	}

	.ftext {
		display: flex;
		flex-direction: column;
		gap: 2px;
		padding-top: 1px;
		font-size: 0.875rem;
		line-height: 1.45;
		color: var(--ink-soft);
	}

	.ftext strong {
		font-size: var(--text-base);
		font-weight: 700;
		letter-spacing: -0.01em;
		color: var(--ink);
	}

	.more {
		display: inline-flex;
		align-items: center;
		gap: var(--s-1);
		min-height: 44px;
		margin-top: var(--s-3);
		padding: 0 var(--s-3) 0 var(--s-2);
		border-radius: 10px;
		font-size: var(--text-control);
		font-weight: 700;
		color: var(--ink);
	}

	.more:hover {
		background: var(--hover);
	}

	.more > :global(.icon) {
		color: var(--accent);
		transition: transform var(--dur) var(--ease);
	}

	.more.open > :global(.icon) {
		transform: rotate(90deg);
	}

	.proof {
		margin-top: var(--s-6);
		padding-top: var(--s-5);
		border-top: 1px solid var(--line);
		font-size: var(--text-caption);
		line-height: 1.6;
		color: var(--ink-soft);
	}

	.proof :global(.icon) {
		display: inline-block;
		color: var(--ok);
		vertical-align: -4px;
		margin-right: 6px;
	}

	.proof a {
		color: var(--ink);
		font-weight: 700;
		white-space: nowrap;
	}

	/* ---------- Drag-over ---------- */

	.drop {
		position: fixed;
		inset: calc(var(--bar-h) + var(--safe-top) + var(--s-3)) var(--s-3) var(--s-3);
		z-index: 5;
		display: grid;
		place-items: center;
		border: 2px dashed var(--accent);
		border-radius: 24px;
		background: color-mix(in srgb, var(--surface) 82%, transparent);
		backdrop-filter: blur(6px);
		font-weight: 700;
		font-size: clamp(1.5rem, 5vw, 2.5rem);
		letter-spacing: -0.03em;
		color: var(--accent);
		opacity: 0;
		visibility: hidden;
		pointer-events: none;
		transition:
			opacity var(--dur) var(--ease),
			visibility 0s linear var(--dur);
	}

	.dragging .drop {
		opacity: 1;
		visibility: visible;
		transition: opacity var(--dur) var(--ease);
	}

	/* ---------- Wider screens ---------- */

	@media (min-width: 600px) {
		.grid {
			grid-template-columns: repeat(2, minmax(0, 1fr));
			gap: var(--s-3);
		}

		.give {
			padding: var(--s-6);
		}
	}

	@media (min-width: 900px) {
		.hero {
			grid-template-columns: minmax(0, 1.25fr) minmax(0, 1fr);
			align-items: center;
			gap: var(--s-6);
			padding-top: var(--s-7);
		}

		.art-phone {
			display: none;
		}

		.eyebrow {
			display: inline-flex;
			align-items: center;
			gap: var(--s-2);
			margin-bottom: var(--s-5);
			padding: 6px 12px 6px 10px;
			border: 1px solid var(--lu-tint-line);
			border-radius: 999px;
			background: var(--lu-tint);
			font-size: var(--text-caption);
			font-weight: 700;
			color: var(--accent);
		}

		.dot {
			width: 6px;
			height: 6px;
			border-radius: 50%;
			background: currentColor;
		}

		.tagline {
			margin-top: var(--s-3);
		}

		.body {
			margin-top: var(--s-5);
			max-width: 31rem;
			font-size: 1.1875rem;
		}

		.cta {
			margin-top: var(--s-6);
		}

		.art {
			position: relative;
			display: grid;
			place-items: center;
			aspect-ratio: 1;
			max-width: 26rem;
			justify-self: end;
			width: 100%;
		}

		.art :global(.lockmark) {
			position: relative;
			width: 62%;
			height: auto;
			filter: drop-shadow(0 30px 40px rgb(22 48 216 / 0.3)) drop-shadow(0 4px 8px rgb(11 13 18 / 0.12));
		}

		.halo {
			position: absolute;
			inset: 0;
			border-radius: 40px;
			background:
				radial-gradient(circle at 50% 50%, color-mix(in srgb, var(--accent) 16%, transparent), transparent 62%),
				radial-gradient(circle, color-mix(in srgb, var(--ink) 14%, transparent) 1px, transparent 1.5px) 0 0 / 18px 18px;
			mask-image: radial-gradient(circle at 50% 50%, #000 30%, transparent 72%);
		}

		.give {
			grid-template-columns: minmax(0, 1.4fr) minmax(0, 1fr);
			align-items: center;
			gap: var(--s-4) var(--s-6);
			margin-top: var(--s-7);
		}

		.give-links {
			grid-template-columns: 1fr;
			justify-self: end;
			width: 100%;
			max-width: 19rem;
		}

		.give-note {
			grid-column: 1 / -1;
			padding-top: var(--s-4);
			border-top: 1px solid var(--line);
		}
	}
</style>
