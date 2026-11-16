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
	/* Same look as the giving card on the start page (LockupSplash.svelte). */
	.ask {
		display: grid;
		gap: var(--s-3);
		padding: var(--s-4);
		border: 1px solid var(--lu-tint-line, var(--line));
		border-radius: 16px;
		background: var(--lu-tint, var(--hover));
	}

	.lead {
		color: var(--ink);
		line-height: 1.45;
	}

	.links {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(9rem, 1fr));
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
		border-radius: 12px;
		background: var(--lu-give, var(--ink));
		color: var(--lu-give-ink, var(--surface));
		font-size: var(--text-control);
		font-weight: 700;
		text-decoration: none;
		white-space: nowrap;
		box-shadow: 0 1px 2px rgb(11 13 18 / 0.2);
	}

	.links a:hover {
		background: color-mix(in srgb, var(--lu-give, var(--ink)) 84%, var(--accent));
	}

	.note {
		color: var(--ink-soft);
	}

	.dismiss {
		justify-self: start;
		display: inline-flex;
		align-items: center;
		min-height: 36px;
		padding: 0 var(--s-3);
		border: 1px solid var(--line-strong);
		border-radius: 10px;
		background: var(--surface);
		color: var(--ink);
		font-family: inherit;
		font-size: var(--text-control);
		font-weight: 700;
		cursor: pointer;
	}

	.dismiss:hover {
		background: color-mix(in srgb, var(--surface) 100%, var(--ink) 5%);
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
	}
</style>
