<script lang="ts">
	/**
	 * "Mark N for blackout" under the Find bar's field, and its confirm. Never redacts at
	 * once: the confirm says how many boxes go on how many pages and, honestly, what the
	 * search could not see. Marking adds ordinary redaction boxes (the person can check,
	 * move or delete each one in the editor) and remembers the words for the export's
	 * check (DocStore.markForBlackout), as one undo step.
	 */
	import type { PageRef, Source, SourceId } from '../core/types';
	import { getApp } from '../app';
	import Button from '../ui/Button.svelte';
	import Dialog from '../ui/Dialog.svelte';
	import { toasts } from '../ui/toasts.svelte';
	import { readText } from '../editor/page-text.svelte';
	import { docText, linesOf } from './doc-text.svelte';
	import { confirmTitle, markedToast, planBlackout, unseenLines, type BlackoutPlan } from './blackout';

	interface Props {
		pages: readonly PageRef[];
		sources: readonly Source[];
		/** The folded query (find/match.ts foldQuery) and the term as typed. */
		query: string;
		term: string;
		/** Matches the bar counts. */
		hits: number;
	}

	let { pages, sources, query, term, hits }: Props = $props();

	const dt = docText();
	let open = $state(false);
	let plan = $state.raw<BlackoutPlan | null>(null);
	let planTerm = $state('');
	const reading = $derived(dt.enabled && !dt.complete);

	function makePlan(): BlackoutPlan {
		const byId = new Map<SourceId, Source>(sources.map((s) => [s.id, s]));
		return planBlackout(
			pages.map((page) => {
				const source = byId.get(page.sourceId);
				const text = source ? (dt.text(source, page.pageIndex) ?? null) : null;
				return {
					page,
					source,
					text,
					annots: source ? readText(source.id, page.pageIndex)?.annots : undefined,
					lines: source && text ? linesOf(dt, source, page, true) : null
				};
			}),
			query
		);
	}

	function ask() {
		planTerm = term.replace(/\s+/g, ' ').trim();
		plan = makePlan();
		open = true;
	}

	function mark() {
		const p = plan;
		open = false;
		if (!p || !p.boxes.length) return;
		const store = getApp().store;
		store.markForBlackout(planTerm, p.boxes);
		const step = store.undoToken;
		toasts.show({
			message: markedToast(p.boxes.length),
			tone: 'ok',
			// Undoes this marking only while it is still the last step.
			action: { label: 'Undo', run: () => void (store.undoToken === step && store.undo()) }
		});
	}

	const label = $derived(`Mark ${hits.toLocaleString('en-US')} for blackout`);
	const notes = $derived(plan ? unseenLines(plan, reading) : []);
</script>

<Button variant="secondary" icon="redact" class="mark-btn" data-testid="find-mark" onclick={ask}>{label}</Button>

<Dialog bind:open title={plan && plan.boxes.length ? confirmTitle(plan) : 'Nothing to mark'} width="440px">
	{#if plan}
		<div class="mark-body" data-testid="mark-confirm">
			{#if plan.boxes.length}
				<p>
					Each “{planTerm}” found gets an ordinary blackout box you can check, move or delete. Nothing is removed until you export,
					and the export then checks that “{planTerm}” is gone from the whole file.
				</p>
			{:else}
				<p>Every match is already blacked out or hidden by a crop.</p>
			{/if}
			<p class="unseen-head">Search could not see:</p>
			<ul class="unseen">
				{#each notes as line, i (i)}<li>{line}</li>{/each}
			</ul>
		</div>
	{/if}
	{#snippet actions()}
		<Button variant="quiet" onclick={() => (open = false)}>Cancel</Button>
		{#if plan && plan.boxes.length}
			<Button variant="primary" icon="redact" data-testid="mark-go" onclick={mark}>Mark {plan.boxes.length.toLocaleString('en-US')}</Button>
		{/if}
	{/snippet}
</Dialog>

<style>
	.mark-body {
		display: grid;
		gap: var(--s-3);
	}

	.mark-body p {
		margin: 0;
	}

	.unseen-head {
		font-weight: 600;
	}

	.unseen {
		display: grid;
		gap: var(--s-2);
		margin: 0;
		padding-left: var(--s-4);
		font-size: var(--text-caption);
		color: var(--ink-soft);
	}
</style>
