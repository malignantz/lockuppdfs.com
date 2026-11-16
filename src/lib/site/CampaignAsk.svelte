<script lang="ts">
	// One quiet note after a file has been saved, on the campaign build only. It makes no
	// request of its own, has no effect on the download, and is not shown again once
	// dismissed. Render it only after the save has happened.
	import { campaign } from './site';
	import { askState, dismissAsk, readAskState } from './ask-state.svelte';

	readAskState();
	const ask = campaign?.ask ?? null;
	const fee = campaign?.splash.fee ?? null;
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
	/* The campaign's poster palette (black, off-white, one orange), as on the start page. */
	.ask {
		display: grid;
		gap: var(--s-3);
		padding: var(--s-4);
		border-radius: 6px;
		background: var(--lk-black);
		color: var(--lk-ink);
	}

	.fee {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--s-3);
		padding-bottom: var(--s-3);
		border-bottom: 2px dashed var(--lk-line);
		font-family: var(--font-display);
		font-size: 1.25rem;
		line-height: 1;
		letter-spacing: 0.04em;
		text-transform: uppercase;
	}

	.amount {
		padding: 3px 7px 2px;
		background: var(--lk-orange);
		color: var(--lk-black);
		font-size: 1.5rem;
		transform: rotate(-3deg);
	}

	.lead {
		color: var(--lk-ink);
		font-weight: 600;
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
		flex: 1 1 9rem;
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
		background: var(--lk-orange);
		color: var(--lk-black);
		font-weight: 800;
		text-decoration: none;
	}

	.links a:hover {
		background: var(--lk-orange-hi);
	}

	.note {
		color: var(--lk-soft);
	}

	.dismiss {
		justify-self: start;
		padding: 0 var(--s-3);
		border: 1px solid var(--lk-line);
		background: transparent;
		color: var(--lk-ink);
		font-family: inherit;
		cursor: pointer;
	}

	.dismiss:hover {
		background: rgb(244 239 230 / 0.08);
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
