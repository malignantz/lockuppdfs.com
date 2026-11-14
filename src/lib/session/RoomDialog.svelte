<script lang="ts">
	import { onMount } from 'svelte';
	import Button from '../ui/Button.svelte';
	import Dialog from '../ui/Dialog.svelte';
	import { describeBytes, describeSize, savedAgo } from './format';
	import type { ProjectCard } from './session';

	/**
	 * "Make room": the open work could not be kept (no room, or as many as are kept).
	 * Lists the other saved work, oldest first, with its size, so the person picks what
	 * to forget. Nothing is ever deleted without that choice.
	 */
	interface Props {
		open: boolean;
		/** Why: the status line. */
		line: string;
		cards: ProjectCard[];
		onforget: (card: ProjectCard) => void;
	}

	let { open = $bindable(false), line, cards, onforget }: Props = $props();

	let now = $state(Date.now());
	onMount(() => {
		const t = setInterval(() => (now = Date.now()), 30_000);
		return () => clearInterval(t);
	});

	const others = $derived(cards.filter((c) => !c.open && !c.elsewhere).sort((a, b) => a.savedAt - b.savedAt));
	/** The one clearly largest (none when sizes tie). */
	const largest = $derived.by(() => {
		const by = [...others].sort((a, b) => b.bytes - a.bytes);
		return by.length > 1 && by[0].bytes > by[1].bytes ? by[0] : null;
	});
</script>

<Dialog bind:open title="Make room for this work" description="Forget other saved work to keep what is open. It is deleted from this device at once." width="480px">
	<p class="why">{line}</p>
	{#if others.length}
		<ul class="list">
			{#each others as c (c.id)}
				<li>
					<span class="text">
						<strong>{c.name}</strong>
						<span class="meta num">
							{describeSize(c)} · {describeBytes(c.bytes)} · {savedAgo(c.savedAt, now, 'edited')}{#if c === others[0] && others.length > 1}&nbsp;· oldest{/if}{#if c === largest}&nbsp;· largest{/if}
						</span>
					</span>
					<Button variant="secondary" icon="trash" aria-label="Forget {c.name}" onclick={() => onforget(c)}>Forget</Button>
				</li>
			{/each}
		</ul>
	{:else}
		<p class="meta">No other work is saved here. The file may be too large for the room this browser gives the site.</p>
	{/if}
	{#snippet actions()}
		<Button variant="quiet" onclick={() => (open = false)}>Close</Button>
	{/snippet}
</Dialog>

<style>
	.why {
		font-size: var(--text-control);
		font-weight: 550;
	}

	.list {
		list-style: none;
		margin: var(--s-3) 0 0;
		padding: 0;
		display: grid;
		gap: var(--s-2);
	}

	li {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--s-3);
		padding: var(--s-2) 0;
		border-top: 1px solid var(--line);
	}

	.text {
		display: grid;
		min-width: 0;
	}

	strong {
		overflow: hidden;
		font-size: var(--text-control);
		white-space: nowrap;
		text-overflow: ellipsis;
	}

	.meta {
		font-size: var(--text-caption);
		color: var(--ink-soft);
	}

	.num {
		font-variant-numeric: tabular-nums;
	}
</style>
