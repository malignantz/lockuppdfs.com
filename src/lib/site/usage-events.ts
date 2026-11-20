// The names of the tool-use events the campaign site counts (LockUpPDFs.com only). Shared
// by the app (src/lib/site/usage.ts, which sends them) and the campaign Worker
// (workers/visits.ts, which drops any name not listed here). A name is all that is ever
// sent: never a file name, text, size, page count or anything else about the file.
// What triggers each one: the table in docs/plans/plan-2026-11-09.md ("Counting which tools are used").

export const USAGE_EVENTS = [
	// Opening files
	'open-pdf',
	'open-picture',
	'open-combine',
	'open-password',
	'open-limited',
	'saved-work-restored',
	// Pages
	'page-rotate',
	'page-delete',
	'page-move',
	'page-duplicate',
	'page-reverse',
	'page-sort',
	'page-crop',
	'page-blank',
	// The page editor
	'tool-signature',
	'tool-initials',
	'sign-drawn',
	'sign-typed',
	'sign-photo',
	'sign-saved',
	'tool-text',
	'tool-date',
	'tool-check',
	'tool-cross',
	'tool-dot',
	'tool-fill-blank',
	'tool-highlight-text',
	'tool-highlight-pen',
	'tool-highlight-box',
	'tool-redact',
	'tool-copy-text',
	'tool-copy-to-pages',
	'form-fill',
	// Find
	'find-used',
	'find-blackout',
	// Export (counted when an export finishes)
	'export-done',
	'export-pages',
	'export-split',
	'export-jpg',
	'export-png',
	'export-optimize',
	'export-fit',
	'export-reduce-pictures',
	'export-password',
	'export-numbers',
	'export-watermark',
	'export-searchable',
	'export-read-all',
	'export-black-white',
	'export-keep-blanks',
	'export-lock-forms',
	'export-remove-details',
	'export-unlocked'
] as const;

export type UsageEvent = (typeof USAGE_EVENTS)[number];

const KNOWN: ReadonlySet<string> = new Set(USAGE_EVENTS);

export function isUsageEvent(name: unknown): name is UsageEvent {
	return typeof name === 'string' && KNOWN.has(name);
}

/** Where the app sends them, on its own origin. */
export const USE_PATH = '/use';
