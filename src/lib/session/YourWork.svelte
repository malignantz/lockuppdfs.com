<script lang="ts">
	import { onMount } from 'svelte';
	import Button from '../ui/Button.svelte';
	import Icon from '../ui/Icon.svelte';
	import IconButton from '../ui/IconButton.svelte';
	import Spinner from '../ui/Spinner.svelte';
	import CardThumb from './CardThumb.svelte';
	import { describeSize, savedAgo } from './format';
	import type { ProjectCard } from './session';

	/**
	 * Home's "Your work": one card per piece of work kept on this device, the open one
	 * first. A card opens its work; its trash button forgets it (after a confirm).
	 */
	interface Props {
		cards: ProjectCard[];
		/** The card being opened. */
		opening: string | null;
		/** Something is busy (files opening): cards wait. */
		busy: boolean;
		/** Keeping work on this device is on. */
		keep: boolean;
		/** Why the open work is not saved, when it is not. */
		notSaved: string | null;
		/** Offer "Make room" (no room, or as many as are kept). */
		canMakeRoom: boolean;
		onopen: (card: ProjectCard) => void;
		onforget: (card: ProjectCard) => void;
		onforgetall: () => void;
		onsettings: () => void;
		onmakeroom: () => void;
	}

	let { cards, opening, busy, keep, notSaved, canMakeRoom, onopen, onforget, onforgetall, onsettings, onmakeroom }: Props = $props();

	let now = $state(Date.now());
	onMount(() => {
		const t = setInterval(() => (now = Date.now()), 30_000);
		return () => clearInterval(t);
	});

	function status(c: ProjectCard): string {
		if (c.id === opening) return 'Opening…';
		if (c.elsewhere) return 'Open in another tab';
		if (c.open && !c.saved) return 'Not saved';
		return savedAgo(c.savedAt, now, 'edited');
	}

	function name(c: ProjectCard): string {
		const parts = [c.name, describeSize(c), status(c)];
		if (c.open) parts.push('open now');
		if (c.needsPassword && !c.open) parts.push('asks for its password');
		return parts.join(', ');
	}
</script>

<section class="work" aria-labelledby="work-title">
	<div class="head">
		<h2 id="work-title">Your work</h2>
		<div class="tools">
			<Button variant="quiet" onclick={onsettings}>Settings</Button>
			{#if keep && cards.some((c) => c.saved)}
				<Button variant="quiet" icon="trash" onclick={onforgetall}>Forget all my work</Button>
			{/if}
		</div>
	</div>
	<p class="note">
		<Icon name="shield-check" size={16} />
		{#if keep}
			Kept on this device only, for 7 days after the last change.
		{:else}
			Not kept on this device: keeping work is off. What is open stays until you close this tab.
		{/if}
	</p>
	{#if notSaved}
		<p class="warn" role="status">
			<Icon name="warning" size={16} /><span>{notSaved}</span>
			{#if canMakeRoom}<button type="button" class="link" onclick={onmakeroom}>Make room</button>{/if}
		</p>
	{/if}

	<ul class="cards">
		{#each cards as c (c.id)}
			<li class="card" class:open={c.open} class:elsewhere={c.elsewhere}>
				<button
					type="button"
					class="hit"
					data-card={c.id}
					data-open={c.open ? '' : undefined}
					aria-label={name(c)}
					aria-disabled={c.elsewhere || (busy && !c.open) ? 'true' : undefined}
					onclick={() => !(c.elsewhere || (busy && !c.open)) && onopen(c)}
				>
					<span class="pic">
						<CardThumb blob={c.thumb} />
						{#if c.open}<span class="badge">Open</span>{/if}
						{#if c.id === opening}<span class="veil"><Spinner size={28} /></span>{/if}
					</span>
					<span class="title">{c.name}</span>
					<span class="meta num">{describeSize(c)}</span>
					<span class="meta" class:unsaved={c.open && !c.saved}>
						{#if c.needsPassword && !c.open}<Icon name="lock" size={13} />{/if}{status(c)}
					</span>
				</button>
				{#if !c.elsewhere && c.id !== opening}
					<IconButton class="forget" icon="trash" label="Forget {c.name}" tooltip={false} onclick={() => onforget(c)} />
				{/if}
			</li>
		{/each}
	</ul>
</section>

<style>
	.work {
		width: 100%;
		margin-bottom: var(--s-6);
		text-align: left;
	}

	.head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--s-2) var(--s-4);
		flex-wrap: wrap;
	}

	h2 {
		font-family: var(--font-serif);
		font-weight: 500;
		font-size: 1.5rem;
		color: var(--ink);
	}

	.tools {
		display: flex;
		gap: var(--s-1);
		flex-wrap: wrap;
		margin-right: calc(-1 * var(--s-2));
	}

	.note,
	.warn {
		display: flex;
		align-items: center;
		gap: 6px;
		flex-wrap: wrap;
		margin-top: 2px;
		font-size: var(--text-caption);
		color: var(--ink-soft);
	}

	.note :global(.icon) {
		color: var(--ok);
	}

	.warn {
		margin-top: var(--s-2);
		color: var(--ink);
	}

	.warn :global(.icon) {
		color: var(--accent);
	}

	.link {
		padding: 2px 4px;
		border-radius: var(--radius-control);
		color: var(--ink);
		font-size: inherit;
		font-weight: 600;
		text-decoration: underline;
		text-underline-offset: 2px;
	}

	.cards {
		list-style: none;
		margin: var(--s-4) 0 0;
		padding: 0;
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(156px, 1fr));
		gap: var(--s-4);
	}

	.card {
		position: relative;
		min-width: 0;
	}

	.hit {
		display: flex;
		flex-direction: column;
		align-items: stretch;
		gap: 2px;
		width: 100%;
		padding: var(--s-2) var(--s-2) var(--s-3);
		border: 1px solid var(--line);
		border-radius: var(--radius-sheet);
		background: var(--surface);
		color: var(--ink);
		text-align: left;
		cursor: pointer;
		transition:
			border-color var(--dur-fast) var(--ease),
			background-color var(--dur-fast) var(--ease);
	}

	.hit:hover {
		border-color: var(--line-strong);
	}

	.open .hit {
		border-color: var(--accent);
		box-shadow: inset 0 0 0 1px var(--accent);
	}

	.hit[aria-disabled='true'] {
		cursor: default;
	}

	.elsewhere .hit {
		background: transparent;
		opacity: 0.8;
	}

	.pic {
		position: relative;
		display: block;
		margin-bottom: var(--s-2);
	}

	.badge {
		position: absolute;
		top: 6px;
		left: 6px;
		padding: 1px 7px;
		border-radius: 999px;
		background: var(--accent);
		color: var(--accent-ink);
		font-size: var(--text-chip);
		font-weight: 650;
		letter-spacing: 0.02em;
	}

	.veil {
		position: absolute;
		inset: 0;
		display: grid;
		place-items: center;
		border-radius: var(--radius-page);
		background: color-mix(in srgb, var(--surface) 60%, transparent);
	}

	.title {
		overflow: hidden;
		padding-right: 28px;
		font-size: var(--text-control);
		font-weight: 600;
		white-space: nowrap;
		text-overflow: ellipsis;
	}

	.meta {
		display: flex;
		align-items: center;
		gap: 4px;
		font-size: var(--text-caption);
		color: var(--ink-soft);
	}

	.meta.unsaved {
		color: var(--accent);
		font-weight: 550;
	}

	.num {
		font-variant-numeric: tabular-nums;
	}

	.card :global(.forget) {
		position: absolute;
		right: 2px;
		bottom: calc(var(--s-3) + 30px);
	}

	@media (max-width: 599px) {
		.work {
			margin-bottom: var(--s-5);
		}

		h2 {
			font-size: 1.3rem;
		}

		.cards {
			grid-template-columns: repeat(2, minmax(0, 1fr));
			gap: var(--s-3);
		}
	}
</style>
