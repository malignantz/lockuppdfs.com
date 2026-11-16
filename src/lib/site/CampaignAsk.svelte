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
	/* The campaign's evidence-tag look (tokens in lockup.css), at dialog scale. */
	.ask {
		position: relative;
		display: grid;
		gap: var(--s-3);
		padding: var(--s-4);
		padding-top: calc(var(--s-4) + 6px);
		border: 3px solid var(--lk-ink);
		border-radius: 4px;
		background: var(--lk-paper);
		color: var(--lk-ink);
		box-shadow: 3px 3px 0 var(--lk-ink);
	}

	/* The orange strip along the top of the tag. */
	.ask::before {
		content: '';
		position: absolute;
		inset: 0 0 auto;
		height: 6px;
		background: var(--lk-orange);
		border-bottom: 2px solid var(--lk-ink);
	}

	.lead {
		font-weight: 600;
		line-height: 1.45;
	}

	.links {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(9.5rem, 1fr));
		gap: var(--s-2);
		padding: 0;
		margin: 0;
		list-style: none;
	}

	.links a {
		display: flex;
		align-items: center;
		justify-content: center;
		min-height: 44px;
		padding: 0 var(--s-3);
		border: 2px solid var(--lk-ink);
		border-radius: 4px;
		background: var(--lk-ink);
		color: var(--lk-paper);
		font-family: var(--lk-display);
		font-size: 1.0625rem;
		letter-spacing: 0.04em;
		text-transform: uppercase;
		text-decoration: none;
		line-height: 1;
	}

	.links a:hover {
		background: var(--lk-paper);
		color: var(--lk-ink);
	}

	.note {
		color: var(--lk-soft);
	}

	.dismiss {
		justify-self: start;
		display: inline-flex;
		align-items: center;
		min-height: 36px;
		padding: 0 var(--s-3);
		border: 2px solid var(--lk-ink);
		border-radius: 4px;
		background: transparent;
		color: var(--lk-ink);
		font-family: inherit;
		font-size: var(--text-control);
		font-weight: 600;
		cursor: pointer;
	}

	.dismiss:hover {
		background: color-mix(in srgb, var(--lk-ink) 7%, transparent);
	}

	.dismiss:focus-visible,
	.links a:focus-visible {
		outline: 3px solid var(--lk-focus);
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
