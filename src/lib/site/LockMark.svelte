<script lang="ts">
	/**
	 * The LockUpPDFs mark: a document with a folded corner and a solid padlock clamped on it,
	 * on a cobalt app tile. Same drawing as design/lockup/icon.svg (the favicon and app icons).
	 * With `click`, the shackle drops shut once on first paint (not under reduced motion).
	 */
	let { size = 28, click = false }: { size?: number; click?: boolean } = $props();
	const id = $props.id();
</script>

<svg class="lockmark" class:click width={size} height={size} viewBox="0 0 120 120" aria-hidden="true" focusable="false">
	<defs>
		<linearGradient id="{id}-tile" x1="0" y1="0" x2="1" y2="1">
			<stop offset="0" stop-color="#4a68ff" />
			<stop offset="1" stop-color="#1630d8" />
		</linearGradient>
		<linearGradient id="{id}-lock" x1="0" y1="0" x2="0" y2="1">
			<stop offset="0" stop-color="#23262f" />
			<stop offset="1" stop-color="#07080b" />
		</linearGradient>
	</defs>
	<rect width="120" height="120" rx="28" fill="url(#{id}-tile)" />
	<rect x="1" y="1" width="118" height="118" rx="27" fill="none" stroke="#ffffff" stroke-opacity=".16" stroke-width="2" />
	<!-- Document -->
	<path
		d="M34 17h33l20 20v53a7 7 0 0 1-7 7H34a7 7 0 0 1-7-7V24a7 7 0 0 1 7-7z"
		fill="#ffffff"
	/>
	<path d="M67 17v13a7 7 0 0 0 7 7h13z" fill="#c3ceff" />
	<rect x="36" y="34" width="22" height="5" rx="2.5" fill="#d9def0" />
	<rect x="36" y="45" width="34" height="5" rx="2.5" fill="#e6e9f4" />
	<rect x="36" y="56" width="14" height="5" rx="2.5" fill="#e6e9f4" />
	<!-- Padlock -->
	<g class="shackle">
		<path d="M61 70V60a14 14 0 0 1 28 0v10" fill="none" stroke="#0b0d12" stroke-width="8.5" stroke-linecap="round" />
	</g>
	<g class="body">
		<rect x="50" y="66" width="50" height="38" rx="10" fill="url(#{id}-lock)" />
		<rect x="50" y="66" width="50" height="38" rx="10" fill="none" stroke="#ffffff" stroke-opacity=".12" stroke-width="1.5" />
		<circle cx="75" cy="82" r="5.5" fill="#ffffff" />
		<rect x="72.75" y="83" width="4.5" height="10" rx="2.25" fill="#ffffff" />
	</g>
</svg>

<style>
	.lockmark {
		flex: none;
		overflow: visible;
	}

	@media (prefers-reduced-motion: no-preference) {
		.click .shackle {
			animation: shut 520ms cubic-bezier(0.3, 1.6, 0.5, 1) 450ms both;
		}

		.click .body {
			transform-origin: 75px 104px;
			animation: thunk 260ms ease-out 640ms both;
		}
	}

	@keyframes shut {
		from {
			transform: translateY(-11px);
		}
		to {
			transform: translateY(0);
		}
	}

	@keyframes thunk {
		0%,
		100% {
			transform: scale(1);
		}
		40% {
			transform: scale(1.04, 0.95);
		}
	}
</style>
