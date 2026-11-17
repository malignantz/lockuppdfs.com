<script lang="ts">
	/**
	 * The campaign's booking photo: a PDF document against a height chart, with a letter
	 * board hung in front of it. Drawn by hand, no images. Also rendered on the server by
	 * scripts/make-lockup-art.mjs for the share image, so it takes its words as props.
	 * The canvas is 3:2 so it can run full width on a phone without getting tall.
	 */
	interface Props {
		label: string;
		placard: { header: string; lines: [string, string]; fee: [string, string] };
		/** Unique per page, so two copies never share gradient ids. */
		id?: string;
	}

	let { label, placard, id = 'bp' }: Props = $props();

	// The height chart: one line every 2 inches, 6 px to the inch, 2 ft 6 in at the bottom edge.
	const y = (inches: number) => 320 - (inches - 30) * 6;
	const W = 480;
	const marks = Array.from({ length: 28 }, (_, i) => 30 + i * 2).map((h) => ({
		h,
		y: y(h),
		kind: h % 12 === 0 ? 'foot' : h % 12 === 6 ? 'half' : 'inch'
	}));
	const feet = (h: number) => `${Math.floor(h / 12)}'${h % 12 ? `${h % 12}"` : ''}`;

	// Letter-board letters are pushed in by hand: never quite straight.
	const jitter = (s: string, seed: number) =>
		[...s].map((_, i) => (((i * 7 + seed * 3) % 5) - 2) * 0.9).join(' ');
</script>

<svg class="booking-photo" viewBox="0 0 480 320" role="img" aria-label={label} focusable="false">
	<defs>
		<radialGradient id="{id}-wall" cx="50%" cy="36%" r="78%">
			<stop offset="0" stop-color="#fbfaf7" />
			<stop offset="0.55" stop-color="#edebe6" />
			<stop offset="1" stop-color="#d6d3cc" />
		</radialGradient>
		<linearGradient id="{id}-board" x1="0" y1="0" x2="0" y2="1">
			<stop offset="0" stop-color="#202022" />
			<stop offset="1" stop-color="#111112" />
		</linearGradient>
		<linearGradient id="{id}-frame" x1="0" y1="0" x2="1" y2="1">
			<stop offset="0" stop-color="#c9cdd2" />
			<stop offset="0.5" stop-color="#8d939a" />
			<stop offset="1" stop-color="#b5bac0" />
		</linearGradient>
		<filter id="{id}-soft" x="-20%" y="-20%" width="140%" height="140%">
			<feGaussianBlur stdDeviation="5" />
		</filter>
	</defs>

	<!-- The wall and its height chart -->
	<rect width={W} height="320" fill="url(#{id}-wall)" />
	<g class="chart" fill="#111">
		{#each marks as m (m.h)}
			{#if m.kind === 'foot'}
				<rect x="0" y={m.y - 1.25} width={W} height="2.5" opacity="0.82" />
				<text x="10" y={m.y - 6} font-size="23">{feet(m.h)}</text>
				<text x={W - 10} y={m.y - 6} font-size="23" text-anchor="end">{feet(m.h)}</text>
			{:else if m.kind === 'half'}
				<rect x="0" y={m.y - 0.75} width={W} height="1.5" opacity="0.5" />
				<text x="10" y={m.y - 5} font-size="11" opacity="0.7">{feet(m.h)}</text>
				<text x={W - 10} y={m.y - 5} font-size="11" opacity="0.7" text-anchor="end">{feet(m.h)}</text>
			{:else}
				<rect x="0" y={m.y - 0.5} width={W} height="1" opacity="0.2" />
				<rect x="0" y={m.y - 0.5} width="9" height="1" opacity="0.55" />
				<rect x={W - 9} y={m.y - 0.5} width="9" height="1" opacity="0.55" />
			{/if}
		{/each}
	</g>

	<g transform="translate(240 320) scale(1.13) translate(-200 -320)">
	<!-- The flash throws a hard, soft-edged shadow up and to the right -->
	<g opacity="0.2" filter="url(#{id}-soft)" transform="translate(12 6)">
		<path d="M134 60H236L274 98V340H126V66Q126 60 134 60Z" />
		<rect x="90" y="186" width="220" height="122" rx="6" />
	</g>

	<!-- The document -->
	<g stroke="#111" stroke-width="3.5" stroke-linejoin="round" stroke-linecap="round">
		<path d="M135 62H234L272 100V340H128V69Q128 62 135 62Z" fill="#fff" />
		<path d="M234 62V93Q234 100 241 100H272" fill="#e2e5e8" />
	</g>
	<g fill="#c3c8ce">
		<rect x="146" y="82" width="62" height="7" rx="3.5" fill="#9ba1a9" />
		<rect x="146" y="98" width="78" height="5" rx="2.5" />
		<rect x="194" y="126" width="62" height="5" rx="2.5" />
		<rect x="194" y="138" width="46" height="5" rx="2.5" />
		<rect x="146" y="160" width="108" height="5" rx="2.5" />
		<rect x="146" y="172" width="90" height="5" rx="2.5" />
	</g>
	<!-- Its type tag -->
	<rect x="108" y="116" width="76" height="34" rx="3" fill="#ff6a13" stroke="#111" stroke-width="3.5" />
	<text x="146" y="143" font-size="25" text-anchor="middle" fill="#111" letter-spacing="1.5">PDF</text>

	<!-- The cord the board hangs from, passing behind the document -->
	<g fill="none" stroke="#111" stroke-width="3" stroke-linecap="round">
		<path d="M113 194L129 152" />
		<path d="M287 194L271 152" />
	</g>

	<!-- The letter board -->
	<rect x="92" y="188" width="216" height="118" rx="5" fill="url(#{id}-board)" stroke="url(#{id}-frame)" stroke-width="5" />
	<g stroke="#2a2a2d" stroke-width="1">
		{#each Array.from({ length: 21 }, (_, i) => 195 + i * 5) as gy (gy)}
			<path d="M97 {gy}H303" />
		{/each}
	</g>
	<circle cx="113" cy="196" r="3.2" fill="#8d939a" />
	<circle cx="287" cy="196" r="3.2" fill="#8d939a" />
	<g class="letters" text-anchor="middle" fill="#f3f3f1">
		<text x="200" y="208" font-size="11" letter-spacing="2.6" fill="#b9bec4">{placard.header}</text>
		<text x="200" y="242" font-size="33" letter-spacing="1.5" rotate={jitter(placard.lines[0], 1)}>{placard.lines[0]}</text>
		<text x="200" y="274" font-size="33" letter-spacing="1.5" rotate={jitter(placard.lines[1], 2)}>{placard.lines[1]}</text>
		<text x="200" y="297" font-size="19" letter-spacing="1.6"
			><tspan rotate={jitter(placard.fee[0], 3)}>{placard.fee[0]}</tspan> <tspan fill="#ff7a2e" rotate={jitter(placard.fee[1], 4)}
				>{placard.fee[1]}</tspan
			></text
		>
	</g>
	</g>
</svg>

<style>
	.booking-photo {
		display: block;
		width: 100%;
		height: auto;
		font-family: var(--font-display, 'Lockup Display', Impact, sans-serif);
	}

	text {
		font-family: inherit;
	}
</style>
