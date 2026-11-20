// Which tools get used, counted on the campaign site only (LockUpPDFs.com). Each use sends
// one tiny POST to /use on this site's own origin, `{ "name": "<event>" }`, and the
// campaign Worker passes the name on to the self-hosted visit counter (workers/visits.ts).
// The names are fixed (usage-events.ts); nothing about the file is ever sent.
//
// On the plain site every function here returns at once: no request is ever made.
// Nothing here throws, waits or shows anything; an event lost offline is simply lost.
//
// Use, not clicks: a tool counts when it puts or changes something on a page (the
// document store's committed steps, watched by watchUsage), an export option when an
// export finishes with it on. Each name is sent at most once per open document; a
// finished export sends its names every time.
import type { Asset, AssetId, ExportOptions, Stamp } from '../core/types';
import type { DocState, DocStore } from '../doc/store';
import { SITE_ID } from './site';
import { USE_PATH, type UsageEvent } from './usage-events';

const ON = SITE_ID === 'lockup';

/** Names sent for the open document (cleared when another document is opened or started). */
const seen = new Set<UsageEvent>();

function post(name: UsageEvent): void {
	try {
		const body = JSON.stringify({ name });
		if (typeof navigator !== 'undefined' && navigator.sendBeacon?.(USE_PATH, body)) return;
		void fetch(USE_PATH, { method: 'POST', body, keepalive: true, credentials: 'omit' }).catch(() => undefined);
	} catch {
		// Counting is best effort.
	}
}

/** Count one use, at most once per open document. */
export function used(name: UsageEvent): void {
	if (!ON || seen.has(name)) return;
	seen.add(name);
	post(name);
}

/** Count a finished export: every name, every time. */
export function exported(names: readonly UsageEvent[]): void {
	if (!ON) return;
	for (const name of names) post(name);
}

/** Another document is open (or the workspace was emptied): names may count again. */
export function newDocument(): void {
	seen.clear();
}

/** How each signature or initials picture was made, by asset id, until it is placed. */
const inks = new Map<AssetId, 'sign-drawn' | 'sign-typed' | 'sign-photo' | 'sign-saved'>();

/** The signature pad made or picked a picture: `how` counts once it is placed on a page. */
export function inkMade(id: AssetId, how: 'draw' | 'type' | 'upload' | 'saved'): void {
	if (ON) inks.set(id, how === 'draw' ? 'sign-drawn' : how === 'type' ? 'sign-typed' : how === 'upload' ? 'sign-photo' : 'sign-saved');
}

const MARKS = { check: 'tool-check', cross: 'tool-cross', dot: 'tool-dot' } as const;

function stampEvents(s: Stamp, assets: readonly Asset[], label: string): UsageEvent[] {
	switch (s.kind) {
		case 'image': {
			const kind = assets.find((a) => a.id === s.assetId)?.kind;
			const how = inks.get(s.assetId);
			const tool: UsageEvent[] = kind === 'signature' ? ['tool-signature'] : kind === 'initials' ? ['tool-initials'] : [];
			return how && tool.length ? [...tool, how] : tool;
		}
		case 'text':
			// The Date tool adds its text in one plain step; the Text tool in its "Add text" step.
			return [label === 'Add stamp' ? 'tool-date' : 'tool-text', ...(s.blank ? (['tool-fill-blank'] as const) : [])];
		case 'mark':
			return [MARKS[s.mark], ...(s.blank ? (['tool-fill-blank'] as const) : [])];
		case 'highlight':
			return [s.rects ? 'tool-highlight-text' : s.pen ? 'tool-highlight-pen' : 'tool-highlight-box'];
		case 'redact':
			return ['tool-redact'];
	}
}

/** Page commands, by the step label the store gives them (doc/store.ts pagesLabel). */
const PAGE_STEPS: [RegExp, UsageEvent][] = [
	[/^Rotate (page|\d+ pages)$/, 'page-rotate'],
	[/^Delete (page|\d+ pages)$/, 'page-delete'],
	[/^Move (page|\d+ pages)$/, 'page-move'],
	[/^Duplicate (page|\d+ pages)$/, 'page-duplicate'],
	[/^Reverse (page|\d+ pages)$/, 'page-reverse'],
	[/^Sort pages by file$/, 'page-sort'],
	[/^Crop (page|\d+ pages)$/, 'page-crop']
];

/**
 * What one committed step did, from the document before and after it. Pure, for tests.
 * Opening files, page commands, marks added on a page that was already there (pages that
 * are new copies are left out), text edited, form answers typed, words marked for blackout.
 */
export function stepEvents(before: DocState, after: DocState, label: string): UsageEvent[] {
	const out = new Set<UsageEvent>();
	for (const [re, name] of PAGE_STEPS) if (re.test(label)) out.add(name);

	const had = new Set(before.sources.map((s) => s.id));
	const added = after.sources.filter((s) => !had.has(s.id));
	for (const s of added) {
		if (s.kind === 'blank') out.add('page-blank');
		else out.add(s.kind === 'pdf' ? 'open-pdf' : 'open-picture');
		if (s.wasEncrypted) out.add(s.limits && !s.limits.password ? 'open-limited' : 'open-password');
	}
	if (added.some((s) => s.kind !== 'blank') && after.sources.filter((s) => s.kind !== 'blank').length > 1) out.add('open-combine');

	if (/ for blackout$/.test(label)) out.add('find-blackout');
	else if (/^Copy .+ to \d+ pages?$/.test(label)) out.add('tool-copy-to-pages');
	else if (label !== 'Duplicate stamp') {
		const old = new Map(before.pages.map((p) => [p.id, new Map(p.stamps.map((s) => [s.id, s]))]));
		for (const p of after.pages) {
			const stamps = old.get(p.id);
			if (!stamps) continue;
			for (const s of p.stamps) {
				const was = stamps.get(s.id);
				if (!was) for (const e of stampEvents(s, after.assets, label)) out.add(e);
				else if (s.kind === 'text' && was.kind === 'text' && s.text !== was.text) out.add('tool-text');
			}
		}
	}

	for (const [id, fields] of Object.entries(after.formValues)) {
		const was = before.formValues[id] ?? {};
		if (Object.entries(fields).some(([k, v]) => v !== was[k] && v !== '' && v !== false)) out.add('form-fill');
	}
	return [...out];
}

/**
 * Count what the document store's committed steps do (undo and redo are not use). A new
 * document starts when the store is reset (new work, closing work) or restored (saved
 * work opened from Home), and when the workspace is emptied (Start over).
 */
export function watchUsage(store: DocStore): () => void {
	if (!ON) return () => undefined;
	let base = store.state;
	return store.subscribe((s) => {
		// Mid-step (a drag, typing a new text box): wait for the step to be kept or dropped.
		if (store.gestureActive) return;
		const prev = base;
		if (s.lastEvent === null) {
			// Reset or restore: the history is gone and so is the document it was about.
			if (s.pages !== prev.pages || s.sources !== prev.sources) {
				newDocument();
				if (s.pages.length) used('saved-work-restored');
			}
			base = s;
			return;
		}
		if (s.lastEvent === prev.lastEvent) return;
		base = s;
		if (s.lastEvent.kind !== 'do') return;
		if (s.lastEvent.label === 'Clear workspace') return newDocument();
		for (const name of stepEvents(prev, s, s.lastEvent.label)) used(name);
	});
}

/** What a finished export had on (`options` as sent to the engine). Pure, for tests. */
export function exportEvents(
	options: ExportOptions,
	ctx: {
		made: 'pdf' | 'split' | 'pictures';
		pictureKind: 'jpg' | 'png';
		/** Only the selected pages were exported. */
		extract: boolean;
		/** Blackout forces some options on; those are not counted as chosen. */
		redacting: boolean;
		/** Pictures the print-size cap could bring down; the option shows only when there are some. */
		oversized: number;
		/** The files had printing or copying limits, which the export left out. */
		limits: boolean;
		/** The export's own limit on scanned pages to read without "Read all" (ocr-option.ts OCR_PAGE_CAP). */
		readCap: number;
	}
): UsageEvent[] {
	const o = options;
	const out: UsageEvent[] = ['export-done'];
	if (ctx.extract) out.push('export-pages');
	if (ctx.made === 'split') out.push('export-split');
	if (ctx.made === 'pictures') out.push(ctx.pictureKind === 'png' ? 'export-png' : 'export-jpg');
	if (o.compress && !o.targetBytes) out.push('export-optimize');
	if (o.targetBytes) out.push('export-fit');
	if (o.printCap && ctx.oversized > 0) out.push('export-reduce-pictures');
	if (o.password) out.push('export-password');
	if (o.numbering) out.push('export-numbers');
	if (o.watermark) out.push('export-watermark');
	if (o.ocr) out.push('export-searchable');
	if (o.ocr && (o.ocrPages ?? 0) > ctx.readCap) out.push('export-read-all');
	if (o.bilevel) out.push('export-black-white');
	if (o.blankFields) out.push('export-keep-blanks');
	if (o.flattenForms && !ctx.redacting) out.push('export-lock-forms');
	if (o.stripMetadata && !ctx.redacting) out.push('export-remove-details');
	if (ctx.limits && ctx.made !== 'pictures') out.push('export-unlocked');
	return out;
}
