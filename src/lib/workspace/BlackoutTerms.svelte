<script lang="ts">
	/**
	 * The export dialog's list of words marked for blackout from Find (DocState.blackout):
	 * the export reads its own finished file and refuses to deliver it while any of them is
	 * still there. Each can be dropped from the check (someone kept one occurrence on
	 * purpose); dropping is one undo step and leaves the boxes as they are.
	 */
	import type { DocStore } from '../doc/store';
	import { useDocStore } from '../doc/store.svelte';
	import Icon from '../ui/Icon.svelte';

	interface Props {
		store: DocStore;
	}

	let { store }: Props = $props();
	const doc = $derived(useDocStore(store));
	const terms = $derived(doc.state.blackout);
</script>

{#if terms.length}
	<div class="terms" role="group" aria-labelledby="blackout-terms-head" data-testid="blackout-terms">
		<p id="blackout-terms-head" class="head">
			<Icon name="shield-check" size={18} />
			<span>After export, the file is checked for {terms.length === 1 ? 'this word' : 'these words'}. It is not saved if any is still there.</span>
		</p>
		<ul>
			{#each terms as t (t)}
				<li class="term">
					<span class="word">{t}</span>
					<button type="button" class="drop" aria-label={`Stop checking for “${t}”`} title={`Stop checking for “${t}”`} onclick={() => store.dropBlackoutTerm(t)}>
						<Icon name="close" size={16} />
					</button>
				</li>
			{/each}
		</ul>
	</div>
{/if}

<style>
	.terms {
		display: grid;
		gap: var(--s-2);
	}

	.head {
		display: flex;
		gap: var(--s-2);
		margin: 0;
		font-size: var(--text-caption);
		color: var(--ink-soft);
	}

	.head :global(.icon) {
		flex: none;
		color: var(--ok);
	}

	ul {
		display: flex;
		flex-wrap: wrap;
		gap: var(--s-2);
		margin: 0;
		padding: 0 0 0 26px;
		list-style: none;
	}

	.term {
		display: inline-flex;
		align-items: center;
		max-width: 100%;
		min-height: 32px;
		padding-left: var(--s-3);
		border: 1px solid var(--line);
		border-radius: 16px;
		background: var(--surface);
		font-size: var(--text-caption);
	}

	.word {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.drop {
		display: inline-grid;
		place-items: center;
		flex: none;
		width: 32px;
		height: 32px;
		padding: 0;
		border: 0;
		border-radius: 50%;
		background: transparent;
		color: var(--ink-soft);
		cursor: pointer;
	}

	.drop:hover {
		color: var(--ink);
		background: var(--hover);
	}

	.drop:focus-visible {
		outline: 2px solid var(--accent);
		outline-offset: -2px;
	}

	@media (pointer: coarse) {
		.term {
			min-height: 44px;
			border-radius: 22px;
		}

		.drop {
			width: 44px;
			height: 44px;
		}
	}
</style>
