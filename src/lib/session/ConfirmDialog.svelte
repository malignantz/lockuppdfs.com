<script lang="ts" module>
	export interface ConfirmAsk {
		title: string;
		body: string;
		/** The confirming button's words. */
		ok: string;
		/** A deletion: the button is the danger one. */
		danger?: boolean;
	}
</script>

<script lang="ts">
	import Button from '../ui/Button.svelte';
	import Dialog from '../ui/Dialog.svelte';

	/** One question with Cancel and one plain answer ("Forget", "Start new work"). */
	let { ask, onanswer }: { ask: ConfirmAsk | null; onanswer: (yes: boolean) => void } = $props();

	let open = $state(false);
	let shown = $state<ConfirmAsk | null>(null);
	let answered = false;

	$effect(() => {
		if (ask) {
			shown = ask;
			answered = false;
			open = true;
		} else open = false;
	});

	function answer(yes: boolean) {
		if (answered) return;
		answered = true;
		open = false;
		onanswer(yes);
	}
</script>

<Dialog bind:open title={shown?.title ?? ''} width="420px" onclose={() => answer(false)}>
	<p class="body">{shown?.body}</p>
	{#snippet actions()}
		<Button variant="quiet" onclick={() => answer(false)}>Cancel</Button>
		<!-- Focus starts on Cancel (the Dialog's first control), so Enter never deletes by accident. -->
		<Button variant={shown?.danger ? 'danger' : 'primary'} onclick={() => answer(true)}>{shown?.ok}</Button>
	{/snippet}
</Dialog>

<style>
	.body {
		font-size: var(--text-control);
		line-height: 1.5;
	}
</style>
