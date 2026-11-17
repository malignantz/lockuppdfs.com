<script lang="ts" module>
	// The bars slide shut once per page load, not every time Home is shown again.
	let played = false;
</script>

<script lang="ts">
	import { untrack } from 'svelte';

	/**
	 * The LockUpPDFs mark (campaign build only): a prison-orange document behind cell bars,
	 * with a padlock. Same drawings as design/lockup/icon.svg (full) and icon-small.svg
	 * (simple, for the top bar and other small sizes).
	 */
	interface Props {
		size?: number;
		/** The simplified drawing, for 32 px and below. */
		simple?: boolean;
		/** Slide the bars shut on first show (skipped under prefers-reduced-motion). */
		animate?: boolean;
	}

	let { size = 96, simple = false, animate = false }: Props = $props();
	// Decided once, when the mark is first shown.
	const browser = typeof window !== 'undefined';
	const wants = untrack(() => animate);
	const motion = wants && !(browser && played);
	if (wants && browser) played = true;
</script>

{#if simple}
	<svg class="lk-icon" width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" focusable="false">
		<path fill="#ff6b1a" d="M7.5 3h11l6 6v19a1 1 0 0 1-1 1h-16a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z" />
		<path fill="#ffb27f" d="M18.5 3v5a1 1 0 0 0 1 1h5z" />
		<g fill="#f4efe6" stroke="#0d0d0c" stroke-width="1.2" paint-order="stroke">
			<rect x="10" y="1" width="3.4" height="30" rx="1.7" />
			<rect x="18.6" y="1" width="3.4" height="30" rx="1.7" />
		</g>
		<path d="M13.2 18.6v-2a2.8 2.8 0 0 1 5.6 0v2" fill="none" stroke="#0d0d0c" stroke-width="4.2" />
		<path d="M13.2 18.6v-2a2.8 2.8 0 0 1 5.6 0v2" fill="none" stroke="#f4efe6" stroke-width="2" />
		<rect x="11" y="18" width="10" height="9" rx="1.8" fill="#f4efe6" stroke="#0d0d0c" stroke-width="1.2" />
		<circle cx="16" cy="22.2" r="1.3" fill="#0d0d0c" />
	</svg>
{:else}
	<svg class="lk-icon" class:motion width={size} height={size} viewBox="0 0 120 120" aria-hidden="true" focusable="false">
		<path fill="#ff6b1a" d="M30 12h42l22 22v70a4 4 0 0 1-4 4H30a4 4 0 0 1-4-4V16a4 4 0 0 1 4-4z" />
		<path fill="#ffb27f" d="M72 12v18a4 4 0 0 0 4 4h18z" />
		<g fill="#0d0d0c" opacity=".55">
			<rect x="34" y="24" width="26" height="6" rx="3" />
			<rect x="34" y="42" width="52" height="4" rx="2" />
			<rect x="34" y="52" width="44" height="4" rx="2" />
			<rect x="34" y="62" width="52" height="4" rx="2" />
			<rect x="34" y="72" width="36" height="4" rx="2" />
		</g>
		<g class="bars" fill="#f4efe6" stroke="#0d0d0c" stroke-width="3" paint-order="stroke">
			<rect x="36" y="3" width="9" height="114" rx="4.5" />
			<rect x="55.5" y="3" width="9" height="114" rx="4.5" />
			<rect x="75" y="3" width="9" height="114" rx="4.5" />
		</g>
		<g class="lock">
			<path d="M51.5 86V77a8.5 8.5 0 0 1 17 0v9" fill="none" stroke="#0d0d0c" stroke-width="14" stroke-linecap="round" />
			<path d="M51.5 86V77a8.5 8.5 0 0 1 17 0v9" fill="none" stroke="#f4efe6" stroke-width="7" stroke-linecap="round" />
			<rect x="42" y="83.5" width="36" height="29" rx="5.5" fill="#f4efe6" stroke="#0d0d0c" stroke-width="3" />
			<path fill="#0d0d0c" d="M60 91a4.5 4.5 0 0 1 2.7 8.1l1.3 7.4h-8l1.3-7.4A4.5 4.5 0 0 1 60 91z" />
		</g>
	</svg>
{/if}

<style>
	.lk-icon {
		flex: none;
		overflow: hidden;
	}

	.motion .bars {
		animation: bars-shut 520ms cubic-bezier(0.3, 0, 0.1, 1) 120ms both;
	}

	.motion .lock {
		transform-box: fill-box;
		transform-origin: 50% 0;
		animation: lock-on 360ms cubic-bezier(0.3, 1.6, 0.5, 1) 560ms both;
	}

	@keyframes bars-shut {
		from {
			transform: translateY(-104%);
		}
		to {
			transform: none;
		}
	}

	@keyframes lock-on {
		from {
			opacity: 0;
			transform: translateY(-14px) rotate(-10deg);
		}
		to {
			opacity: 1;
			transform: none;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.motion .bars,
		.motion .lock {
			animation: none;
		}
	}
</style>
