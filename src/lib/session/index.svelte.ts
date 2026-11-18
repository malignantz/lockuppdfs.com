/**
 * The app's one saved-work controller (session.ts), wired to the real store,
 * engine, renderer (thumbnails), IndexedDB and Web Locks, plus a reactive view for components.
 */
import { createSubscriber } from 'svelte/reactivity';
import { version } from '$app/env';
import { getApp } from '../app';
import { toasts } from '../ui/toasts.svelte';
import { exportForm } from '../workspace/export-form.svelte';
import { cleanExportForm } from './format';
import { heldElsewhere, lockProject } from './owner';
import { makeThumbnail } from './thumbnail';
import { createSession, type Session } from './session';
import { openIdbStorage } from './storage';
import { ocrCache } from '../workspace/ocr-cache';

const KEEP_KEY = 'pdf-workspace.keep-work';
const CHANNEL = 'pdf-workspace-session-news';

let session: Session | undefined;

function readKeep(): boolean {
	try {
		return localStorage.getItem(KEEP_KEY) !== '0';
	} catch {
		return true;
	}
}

function writeKeep(on: boolean) {
	try {
		localStorage.setItem(KEEP_KEY, on ? '1' : '0');
	} catch {
		// Not remembered; storage is probably blocked anyway.
	}
}

function channel() {
	if (typeof BroadcastChannel === 'undefined') return undefined;
	const ch = new BroadcastChannel(CHANNEL);
	return {
		post: (msg: string) => ch.postMessage(msg),
		listen: (fn: (msg: string) => void) => {
			ch.onmessage = (e) => typeof e.data === 'string' && fn(e.data);
		}
	};
}

export function getSession(): Session {
	if (session) return session;
	const app = getApp();
	const s = createSession({
		store: app.store,
		engine: app.engine,
		openStorage: openIdbStorage,
		lock: lockProject,
		heldElsewhere: () => heldElsewhere(s.current),
		thumbnail: (st) => makeThumbnail(app.renderer, st),
		prefs: { get: readKeep, set: writeKeep },
		exportForm: {
			get: () => cleanExportForm($state.snapshot(exportForm)),
			set: (f) => Object.assign(exportForm, cleanExportForm(f))
		},
		app: version,
		estimate: navigator.storage?.estimate ? () => navigator.storage.estimate() : undefined,
		channel: channel(),
		notify: (message, tone) => toasts.show({ message, tone }),
		onMeasure: (what, ms) => {
			try {
				performance.measure(`session-${what}`, { start: performance.now() - ms, duration: ms });
			} catch {
				// Timing only.
			}
		}
	});
	app.onSourceReleased((id) => s.sourceReleased(id));
	// Text read from scanned pages is kept with saved work (and deleted with it).
	ocrCache().useStore(() => s.ocrStore());
	session = s;
	return s;
}

/** Reactive view: reading a getter inside an effect or the template tracks the session. */
export function useSession(s: Session) {
	const subscribe = createSubscriber((update) => s.subscribe(update));
	return {
		get state() {
			subscribe();
			return s.state;
		},
		get line() {
			subscribe();
			return s.line;
		},
			get restoring() {
			subscribe();
			return s.restoring;
		},
		get keep() {
			subscribe();
			return s.keep;
		},
		get saving() {
			subscribe();
			return s.saving;
		},
		get cards() {
			subscribe();
			return s.cards;
		},
		get opening() {
			subscribe();
			return s.opening;
		},
		get current() {
			subscribe();
			return s.current;
		}
	};
}
