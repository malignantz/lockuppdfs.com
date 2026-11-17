<script lang="ts">
	import Icon from './Icon.svelte';
	import Mark from './Mark.svelte';
	import { topbar } from './topbar.svelte';
	import { campaign } from '../site/site';
	import LockupMark from '../site/LockupMark.svelte';
</script>

<header class="topbar" class:lockup-theme={!!campaign} class:lk={!!campaign}>
	<a
		class="wordmark"
		href="/"
		aria-label="{campaign ? campaign.name : 'pdf.garrettholmes.com'}, home"
		onclick={(e) => {
			if (!topbar.home || e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
			e.preventDefault();
			topbar.home();
		}}
	>
		{#if campaign}<LockupMark size={30} />{:else}<Mark size={26} />{/if}
		<span class="name" aria-hidden="true">{#if campaign}<span class="lk-name">{campaign.wordmark[0]}<span class="lk-tag">{campaign.wordmark[1]}</span></span>{:else}<span class="pdf">pdf</span><span class="host">.garrettholmes.com</span>{/if}</span>
	</a>

	<div class="actions">
		{#if topbar.actions}{@render topbar.actions()}{/if}
	</div>

	<a class="local" href="/privacy" aria-label="Stays on this device: how this is enforced">
		<Icon name="shield-check" size={18} />
		<span class="local-text" aria-hidden="true">Stays on this device</span>
	</a>
</header>

<style>
	.topbar {
		position: sticky;
		top: 0;
		z-index: 20;
		display: flex;
		align-items: center;
		gap: var(--s-3);
		height: calc(var(--bar-h) + var(--safe-top));
		padding: var(--safe-top) calc(var(--s-4) + var(--safe-right)) 0 calc(var(--s-4) + var(--safe-left));
		background: var(--surface);
		border-bottom: 1px solid var(--line);
	}

	.wordmark {
		display: inline-flex;
		align-items: center;
		gap: 10px;
		min-height: 40px;
		padding-right: var(--s-1);
		border-radius: var(--radius-control);
		text-decoration: none;
		color: var(--ink);
		white-space: nowrap;
	}

	.name {
		font-family: var(--font-serif);
		font-size: 1.125rem;
		letter-spacing: 0.005em;
		line-height: 1;
	}

	.pdf {
		font-weight: 600;
	}

	.host {
		color: var(--ink-soft);
	}

	/* ---------- LockUpPDFs (campaign build): paper bar, ink rule, the orange tag ---------- */

	.lk {
		background: var(--lk-card);
		border-bottom: 3px solid var(--lk-ink);
	}

	.lk .wordmark {
		gap: 9px;
	}

	.lk-name {
		display: inline-flex;
		align-items: center;
		font-family: var(--font-display);
		font-weight: 400;
		font-size: 1.4375rem;
		line-height: 1;
		letter-spacing: 0.02em;
		text-transform: uppercase;
		color: var(--lk-ink);
	}

	/* The same tag as the headline's second line, small. */
	.lk-tag {
		margin-left: 4px;
		padding: 3px 5px 2px;
		background: var(--lk-orange);
		box-shadow: 2px 2px 0 var(--lk-ink);
		transform: rotate(-2deg);
	}

	.lk .local {
		border-color: color-mix(in srgb, var(--lk-ink) 22%, transparent);
	}

	.actions {
		flex: 1;
		display: flex;
		align-items: center;
		justify-content: flex-end;
		gap: var(--s-1);
		min-width: 0;
	}

	.local {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		min-height: 32px;
		padding: 0 10px 0 8px;
		border-radius: 999px;
		border: 1px solid var(--line);
		color: var(--ok);
		font-size: var(--text-caption);
		font-weight: 550;
		text-decoration: none;
		white-space: nowrap;
		transition:
			background-color var(--dur-fast) var(--ease),
			border-color var(--dur-fast) var(--ease);
	}

	.local:hover {
		background: color-mix(in srgb, var(--ok) 8%, transparent);
		border-color: color-mix(in srgb, var(--ok) 40%, var(--line));
	}

	.local-text {
		color: var(--ink-soft);
	}

	@media (pointer: coarse) {
		.local {
			min-height: 48px;
			min-width: 48px;
			justify-content: center;
		}
	}

	/* Phones: keep the full wordmark unless page actions need the room. With work open, the
	   Home button stands in for it (both go Home), so the row fits at 360 px. */
	@media (max-width: 599px) {
		.topbar:has(.actions > :global(*)) .host {
			display: none;
		}

		.topbar:has(.actions :global(.home-btn)) .wordmark {
			display: none;
		}
	}

	@media (max-width: 359px) {
		.host {
			display: none;
		}
	}

	@media (max-width: 599px) {
		.topbar {
			gap: var(--s-2);
			padding-left: calc(var(--s-3) + var(--safe-left));
			padding-right: calc(var(--s-2) + var(--safe-right));
		}

		.local {
			border-color: transparent;
			padding: 0;
			min-width: var(--control-h);
			min-height: var(--control-h);
			justify-content: center;
		}

		.local-text {
			display: none;
		}
	}
</style>
