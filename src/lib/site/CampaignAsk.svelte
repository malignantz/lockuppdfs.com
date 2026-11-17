<script lang="ts">
	// One quiet note after a file has been saved, on the campaign build only. It makes no
	// request of its own, has no effect on the download, and is not shown again once
	// dismissed. Render it only after the save has happened.
	import { campaign } from './site';
	import { askState, dismissAsk, readAskState } from './ask-state.svelte';

	readAskState();
	const ask = campaign?.ask ?? null;
</script>

{#if ask && !askState.dismissed}
	<aside class="ask" aria-label="A note after your download">
		<p class="lead">{ask.lead}</p>
		<ul class="links">
			{#each ask.links as link (link.href)}
				<li><a href={link.href} target="_blank" rel="noopener noreferrer">{link.label}</a></li>
			{/each}
		</ul>
		<p class="note caption">{ask.note}</p>
		<button type="button" class="dismiss" onclick={dismissAsk}>Not now</button>
	</aside>
{/if}

<style>
	.ask {
		display: grid;
		gap: var(--s-3);
		padding: var(--s-4);
		border: 1px solid var(--line);
		border-radius: var(--radius-control);
		background: var(--hover);
	}

	.lead {
		color: var(--ink);
	}

	.links {
		display: flex;
		flex-wrap: wrap;
		gap: var(--s-2) var(--s-4);
		padding: 0;
		margin: 0;
		list-style: none;
	}

	.links a,
	.dismiss {
		display: inline-flex;
		align-items: center;
		min-height: 32px;
		font-size: var(--text-control);
	}

	.links a {
		font-weight: 600;
	}

	.note {
		color: var(--ink-soft);
	}

	.dismiss {
		justify-self: start;
		padding: 0 var(--s-3);
		border: 1px solid var(--line-strong);
		border-radius: var(--radius-control);
		background: transparent;
		color: var(--ink);
		font-family: inherit;
		cursor: pointer;
	}

	.dismiss:hover {
		background: var(--hover);
	}

	.dismiss:focus-visible,
	.links a:focus-visible {
		outline: 2px solid var(--accent);
		outline-offset: 2px;
	}

	@media (pointer: coarse) {
		.links a,
		.dismiss {
			min-height: 44px;
		}

		.links a {
			min-width: 44px;
		}
	}
</style>
