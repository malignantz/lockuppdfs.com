<script lang="ts">
	import Icon from '../ui/Icon.svelte';

	/** A card's first-page picture (a stored JPEG), or a plain sheet when there is none. */
	let { blob }: { blob: Blob | null } = $props();

	let url = $state<string | null>(null);
	$effect(() => {
		if (!blob) {
			url = null;
			return;
		}
		const u = URL.createObjectURL(blob);
		url = u;
		// Later, not at once: the picture may still be loading from it.
		return () => void setTimeout(() => URL.revokeObjectURL(u), 10_000);
	});
</script>

<span class="thumb" aria-hidden="true">
	{#if url}
		<img src={url} alt="" draggable="false" />
	{:else}
		<span class="blank"><Icon name="file" size={28} /></span>
	{/if}
</span>

<style>
	.thumb {
		display: grid;
		place-items: center;
		width: 100%;
		aspect-ratio: 4 / 5;
		overflow: hidden;
		border-radius: var(--radius-page);
		background: var(--desk-deep);
	}

	img {
		display: block;
		max-width: 86%;
		max-height: 86%;
		border-radius: var(--radius-page);
		box-shadow: var(--shadow-page);
		background: var(--sheet);
	}

	.blank {
		display: grid;
		place-items: center;
		width: 62%;
		aspect-ratio: 1 / 1.3;
		border-radius: var(--radius-page);
		background: var(--sheet);
		box-shadow: var(--shadow-page);
		color: #b9ae95;
	}
</style>
