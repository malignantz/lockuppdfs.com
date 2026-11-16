<script lang="ts">
	import type { Snippet } from 'svelte';
	import Icon from '../ui/Icon.svelte';
	import type { IconName } from '../ui/icons';
	import LockupIcon from './LockupIcon.svelte';
	import type { Campaign } from './site';

	/**
	 * The campaign build's start page ("Behind bars"): a poster with the pun, the one
	 * button, and the giving band, then the same tool list as the plain site. EmptyDesk
	 * renders this instead of its own content on the LockUpPDFs build and keeps the
	 * drag-and-drop handling; this component only shows it.
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

	function onchange() {
		const files = [...(input?.files ?? [])];
		if (input) input.value = '';
		if (files.length) onfiles(files);
	}
</script>

<section class="poster lockup-theme" class:dragging aria-labelledby="empty-title">
	<div class="hero">
		<div class="art">
			<LockupIcon size={240} animate />
		</div>
		<div class="copy">
			<h1 id="empty-title" class="headline">{dragging ? splash.dropping : splash.headline}</h1>
			<p class="tagline">{splash.tagline}</p>
			<p class="sub">{splash.sub}</p>
			<div class="cta">
				<button type="button" class="choose" onclick={() => input?.click()}>
					<Icon name="add" size={24} />Choose files
				</button>
				<span class="drop-hint">or drop them anywhere on this page</span>
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
			{#if newWork}<p class="new-work">{newWork}</p>{/if}
			<p class="proof-line"><Icon name="shield-check" size={16} />{splash.proof}</p>
		</div>
	</div>

	<aside class="give" aria-label={splash.give.label}>
		<div class="stub" aria-hidden="true">
			<span class="fee-label">{splash.fee.label}</span>
			<span class="fee-amount">{splash.fee.amount}</span>
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

	<div class="tools">
		<h2 class="what">What you can do</h2>
		<ul class="features" id="features">
			{#each shown as f (f.title)}
				<li>
					<Icon name={f.icon} size={22} />
					<span class="ftext"><strong>{f.title}</strong><span>{f.line}</span></span>
				</li>
			{/each}
		</ul>
		<button type="button" class="more" class:open={more} aria-expanded={more} aria-controls="features" onclick={() => (more = !more)}>
			<Icon name="chevron-right" size={18} />More it can do
		</button>

		<p class="once">Add a file to start. Everything is in one place, and you download once at the end.</p>

		<p class="proof">
			<Icon name="shield-check" size={18} />Files stay on this device. This page cannot send them anywhere.
			<a href="/privacy">How that is enforced</a>
		</p>
	</div>
</section>

<style>
	.poster {
		position: relative;
		min-height: calc(100dvh - var(--bar-h) - var(--safe-top));
		padding: var(--s-5) calc(var(--s-4) + var(--safe-right)) calc(var(--s-7) + var(--safe-bottom)) calc(var(--s-4) + var(--safe-left));
		background:
			radial-gradient(60rem 36rem at 50% -8rem, rgb(255 107 26 / 0.13), transparent 70%),
			repeating-linear-gradient(90deg, transparent 0 46px, rgb(244 239 230 / 0.028) 46px 52px),
			var(--lk-black);
		color: var(--lk-ink);
		overflow-x: clip;
	}

	/* Drag-over: an orange dashed frame around the whole poster. */
	.poster::after {
		content: '';
		position: absolute;
		inset: var(--s-3);
		border: 3px dashed transparent;
		border-radius: 4px;
		pointer-events: none;
		transition: border-color var(--dur) var(--ease);
	}

	.dragging::after {
		border-color: var(--lk-orange);
	}

	/* ---------- Hero ---------- */

	.hero {
		display: flex;
		flex-direction: column;
		align-items: center;
		text-align: center;
		max-width: 72rem;
		margin: 0 auto;
	}

	.art :global(.lk-icon) {
		width: 112px;
		height: 112px;
		filter: drop-shadow(0 10px 30px rgb(255 107 26 / 0.22));
	}

	.headline {
		margin-top: var(--s-2);
		font-family: var(--font-display);
		font-weight: 400;
		font-size: clamp(4.5rem, 25vw, 9.5rem);
		line-height: 0.92;
		letter-spacing: 0.005em;
		color: var(--lk-ink);
		text-wrap: balance;
		max-width: 6.2ch;
	}

	.tagline {
		margin-top: var(--s-5);
		font-family: var(--font-display);
		font-size: clamp(1.5rem, 6.4vw, 2.25rem);
		line-height: 1.05;
		letter-spacing: 0.01em;
		color: var(--lk-orange);
		text-transform: uppercase;
		text-wrap: balance;
	}

	.sub {
		margin-top: var(--s-2);
		text-wrap: balance;
		font-size: 1.0625rem;
		line-height: 1.4;
		color: var(--lk-soft);
	}

	.cta {
		margin-top: var(--s-5);
		display: flex;
		align-items: center;
		justify-content: center;
		flex-wrap: wrap;
		gap: var(--s-3) var(--s-4);
	}

	.choose {
		display: inline-flex;
		align-items: center;
		gap: var(--s-2);
		min-height: 60px;
		padding: 0 var(--s-6) 0 var(--s-5);
		border-radius: 4px;
		background: var(--lk-orange);
		color: var(--lk-black);
		font-size: 1.1875rem;
		font-weight: 800;
		letter-spacing: 0.01em;
		box-shadow:
			0 0 0 1px rgb(0 0 0 / 0.2) inset,
			0 6px 0 #a83f06,
			0 12px 28px rgb(255 107 26 / 0.25);
		transition:
			transform var(--dur-fast) var(--ease),
			box-shadow var(--dur-fast) var(--ease),
			background-color var(--dur-fast) var(--ease);
	}

	.choose:hover {
		background: var(--lk-orange-hi);
	}

	.choose:active {
		transform: translateY(4px);
		box-shadow:
			0 0 0 1px rgb(0 0 0 / 0.2) inset,
			0 2px 0 #a83f06;
	}

	.choose :global(.icon) {
		stroke-width: 2.6;
	}

	.drop-hint {
		font-size: var(--text-caption);
		color: var(--lk-soft);
	}

	@media (hover: none) and (pointer: coarse) {
		.drop-hint {
			display: none;
		}
	}

	.new-work {
		margin-top: var(--s-3);
		font-size: var(--text-caption);
		color: var(--lk-soft);
	}

	.proof-line {
		margin-top: var(--s-4);
		text-wrap: balance;
		font-size: var(--text-caption);
		color: var(--lk-soft);
	}

	.proof-line :global(.icon) {
		display: inline-block;
		margin-right: 6px;
		vertical-align: -3px;
		color: var(--ok);
	}

	/* ---------- Giving band: a ticket stub torn off the poster ---------- */

	.give {
		--notch: 12px;
		position: relative;
		display: grid;
		max-width: 60rem;
		margin: var(--s-6) auto 0;
		background: var(--lk-paper);
		color: var(--lk-paper-ink);
		border-radius: 6px;
		/* Two half-circle notches where the stub is torn off. */
		mask:
			radial-gradient(circle var(--notch) at 0 var(--tear), transparent 98%, #000) left / 51% 100% no-repeat,
			radial-gradient(circle var(--notch) at 100% var(--tear), transparent 98%, #000) right / 51% 100% no-repeat;
		--tear: 56px;
	}

	.stub {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: var(--s-3);
		height: var(--tear);
		padding: 0 var(--s-5);
		align-items: center;
		border-bottom: 2px dashed color-mix(in srgb, var(--lk-paper-ink) 30%, transparent);
		font-family: var(--font-display);
		text-transform: uppercase;
		line-height: 1;
	}

	.fee-label {
		font-size: 1.25rem;
		letter-spacing: 0.04em;
	}

	.fee-amount {
		font-size: 2rem;
		color: var(--lk-paper-ink);
		background: var(--lk-orange);
		padding: 4px 8px 3px;
		margin-right: -4px;
		transform: rotate(-3deg);
	}

	.give-body {
		display: grid;
		gap: var(--s-4);
		padding: var(--s-5);
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
		flex: 1 1 10rem;
	}

	.give-links a {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: var(--s-2);
		min-height: 52px;
		padding: 0 var(--s-4);
		border-radius: 4px;
		background: var(--lk-black);
		color: var(--lk-ink);
		font-weight: 800;
		font-size: 1.0625rem;
		text-decoration: none;
		transition: background-color var(--dur-fast) var(--ease);
	}

	.give-links a:hover {
		background: #2a2724;
	}

	.give-links a .ext {
		color: var(--lk-orange);
	}

	.give-links a:focus-visible {
		outline: 3px solid var(--lk-orange);
		outline-offset: 3px;
	}

	.give-note {
		font-size: var(--text-caption);
		line-height: 1.5;
		color: var(--lk-paper-soft);
	}

	/* ---------- Home cards, when there is saved work ---------- */

	.work {
		max-width: 60rem;
		margin: var(--s-6) auto 0;
	}

	/* ---------- Tools ---------- */

	.tools {
		display: flex;
		flex-direction: column;
		align-items: center;
		text-align: center;
		max-width: 60rem;
		margin: var(--s-7) auto 0;
	}

	.what {
		font-family: var(--font-display);
		font-weight: 400;
		font-size: 2.25rem;
		line-height: 1;
		text-transform: uppercase;
		letter-spacing: 0.01em;
		color: var(--lk-ink);
	}

	.features {
		list-style: none;
		margin: var(--s-5) 0 0;
		padding: 0;
		width: 100%;
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 1px;
		background: var(--lk-line);
		border: 1px solid var(--lk-line);
		border-radius: 6px;
		overflow: hidden;
		text-align: left;
	}

	.features li {
		display: flex;
		gap: var(--s-3);
		align-items: flex-start;
		padding: var(--s-4);
		background: var(--lk-raise);
	}

	.features li > :global(.icon) {
		flex: none;
		margin-top: 1px;
		color: var(--lk-orange);
	}

	.ftext {
		display: flex;
		flex-direction: column;
		gap: 2px;
		font-size: var(--text-caption);
		line-height: 1.45;
		color: var(--lk-soft);
	}

	.ftext strong {
		font-size: var(--text-control);
		font-weight: 700;
		color: var(--lk-ink);
	}

	.more {
		display: inline-flex;
		align-items: center;
		gap: var(--s-1);
		min-height: 44px;
		margin-top: var(--s-3);
		padding: 0 var(--s-3);
		border-radius: 4px;
		font-size: var(--text-control);
		font-weight: 650;
		color: var(--lk-ink);
	}

	.more:hover {
		background: rgb(244 239 230 / 0.07);
	}

	.more > :global(.icon) {
		color: var(--lk-orange);
		transition: transform var(--dur) var(--ease);
	}

	.more.open > :global(.icon) {
		transform: rotate(90deg);
	}

	.once {
		margin-top: var(--s-2);
		font-size: var(--text-caption);
		color: var(--lk-soft);
	}

	.proof {
		margin-top: var(--s-3);
		max-width: 36rem;
		font-size: var(--text-caption);
		line-height: 1.6;
		color: var(--lk-soft);
		text-wrap: balance;
	}

	.proof :global(.icon) {
		display: inline-block;
		color: var(--ok);
		vertical-align: -4px;
		margin-right: 4px;
	}

	.proof a {
		color: var(--lk-ink);
		white-space: nowrap;
	}

	/* ---------- Wider screens: type left, mark right; the stub turns sideways ---------- */

	@media (min-width: 900px) {
		.poster {
			padding-top: var(--s-6);
		}

		.hero {
			display: grid;
			grid-template-columns: minmax(0, 1fr) auto;
			grid-template-areas: 'copy art';
			align-items: center;
			gap: var(--s-6);
			text-align: left;
			max-width: 60rem;
		}

		.copy {
			grid-area: copy;
		}

		.art {
			grid-area: art;
		}

		.art :global(.lk-icon) {
			width: 340px;
			height: 340px;
		}

		.headline {
			margin-top: 0;
			font-size: clamp(6rem, 12vw, 10.5rem);
		}

		.cta {
			justify-content: flex-start;
		}

		.give {
			grid-template-columns: 11rem minmax(0, 1fr);
			mask:
				radial-gradient(circle var(--notch) at var(--tear-x) 0, transparent 98%, #000) top / 100% 51% no-repeat,
				radial-gradient(circle var(--notch) at var(--tear-x) 100%, transparent 98%, #000) bottom / 100% 51% no-repeat;
			--tear-x: 11rem;
		}

		.stub {
			flex-direction: column;
			justify-content: center;
			gap: var(--s-3);
			height: auto;
			padding: var(--s-5) var(--s-4);
			border-bottom: 0;
			border-right: 2px dashed color-mix(in srgb, var(--lk-paper-ink) 30%, transparent);
			text-align: center;
		}

		.fee-amount {
			font-size: 2.75rem;
		}

		.give-body {
			grid-template-columns: minmax(0, 1fr) auto;
			align-items: center;
			column-gap: var(--s-6);
			padding: var(--s-5) var(--s-6);
		}

		.give-lead {
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

		.give-note {
			grid-column: 1;
		}
	}

	@media (max-width: 599px) {
		.cta {
			width: 100%;
		}

		.choose {
			width: 100%;
			max-width: 22rem;
			justify-content: center;
		}
	}

	@media (max-width: 759px) {
		.features {
			grid-template-columns: 1fr;
			max-width: 30rem;
		}
	}

	@media (max-width: 359px) {
		.poster {
			padding-left: calc(var(--s-3) + var(--safe-left));
			padding-right: calc(var(--s-3) + var(--safe-right));
		}

		.stub {
			padding: 0 var(--s-4);
		}

		.give-body {
			padding: var(--s-4);
		}

		.choose {
			padding: 0 var(--s-5) 0 var(--s-4);
		}
	}
</style>
