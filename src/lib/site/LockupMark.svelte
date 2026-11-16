<script lang="ts">
	/** The campaign mark: a PDF with a padlock on it. Same drawing as design/lockup/favicon.svg. */
	let { size = 24 }: { size?: number } = $props();
</script>

<svg class="mark" width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" focusable="false">
	<g stroke="#111" stroke-width="1.7" stroke-linejoin="round">
		<path d="M7.5 3h10.75L24 8.75V27a1.25 1.25 0 0 1-1.25 1.25H7.5A1.25 1.25 0 0 1 6.25 27V4.25A1.25 1.25 0 0 1 7.5 3z" fill="#fff" />
		<path d="M18.25 3v4.5a1.25 1.25 0 0 0 1.25 1.25H24" fill="#d5d8dd" />
		<path d="M17.5 18v-3.25a4.25 4.25 0 0 1 8.5 0V18" fill="none" stroke-width="2.4" stroke-linecap="round" />
		<rect x="14" y="17.5" width="15.5" height="11.5" rx="1.75" fill="#ff6a13" />
	</g>
	<path d="M21.75 21a1.5 1.5 0 0 1 .75 2.8V25.5h-1.5v-1.7a1.5 1.5 0 0 1 .75-2.8z" fill="#111" />
	<g fill="#9ba1a9"><rect x="9.25" y="9" width="6" height="1.8" rx=".9" /><rect x="9.25" y="12.75" width="9" height="1.5" rx=".75" /></g>
</svg>

<style>
	.mark {
		flex: none;
	}
</style>
