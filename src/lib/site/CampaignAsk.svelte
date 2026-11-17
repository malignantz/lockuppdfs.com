<script lang="ts">
	// One quiet note after a file has been saved, on the campaign build only. It makes no
	// request of its own, has no effect on the download, and is not shown again once
	// dismissed. Render it only after the save has happened.
	import { campaign } from './site';
	import { askState, dismissAsk, readAskState } from './ask-state.svelte';

	readAskState();
	const ask = campaign?.ask ?? null;
	const fee = campaign?.fee ?? null;
</script>

{#if ask && !askState.dismissed}
	<aside class="ask lockup-theme" aria-label="A note after your download">
		{#if fee}<p class="fee" aria-hidden="true"><span>{fee.label}</span><span class="amount">{fee.amount}</span></p>{/if}
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
	/* A release slip in the campaign's palette: paper, an ink frame, the fee on an orange tag. */
	.ask {
		display: grid;
		gap: var(--s-3);
		padding: var(--s-4);
		border: 2px solid var(--lk-ink);
		border-radius: 4px;
		background: var(--lk-card);
		color: var(--lk-ink);
		box-shadow: 4px 4px 0 var(--lk-ink);
	}

	.fee {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--s-3);
		padding-bottom: var(--s-3);
		border-bottom: 2px dashed color-mix(in srgb, var(--lk-ink) 30%, transparent);
		font-family: var(--font-display);
		font-size: 1.25rem;
		line-height: 1;
		letter-spacing: 0.05em;
		text-transform: uppercase;
	}

	.amount {
		padding: 4px 8px 3px;
		background: var(--lk-orange);
		color: var(--lk-ink);
		font-size: 1.5rem;
		letter-spacing: 0.02em;
		box-shadow: 2px 2px 0 var(--lk-ink);
		transform: rotate(-3deg);
	}

	.lead {
		font-weight: 650;
		line-height: 1.45;
	}

	.links {
		display: flex;
		flex-wrap: wrap;
		gap: var(--s-2);
		padding: 0;
		margin: 0;
		list-style: none;
	}

	.links li {
		flex: 1 1 12rem;
	}

	.links a,
	.dismiss {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		min-height: 40px;
		border-radius: 4px;
		font-size: var(--text-control);
	}

	.links a {
		width: 100%;
		padding: 0 var(--s-3);
		background: var(--lk-ink);
		color: var(--lk-card);
		font-weight: 800;
		text-decoration: none;
	}

	.links a:hover {
		background: #2e2c29;
	}

	.note {
		color: var(--lk-soft);
	}

	.dismiss {
		justify-self: start;
		padding: 0 var(--s-3);
		border: 1.5px solid color-mix(in srgb, var(--lk-ink) 35%, transparent);
		background: transparent;
		color: var(--lk-ink);
		font-family: inherit;
		font-weight: 650;
		cursor: pointer;
	}

	.dismiss:hover {
		border-color: var(--lk-ink);
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
