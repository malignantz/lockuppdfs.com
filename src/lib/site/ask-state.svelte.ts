// Whether the donation ask was dismissed during this visit. Kept in memory and in
// sessionStorage (gone when the tab closes). Nothing else is stored: not whether
// a link was followed, not how often the ask was shown.

const KEY = 'ask-dismissed';

function stored(): boolean {
	try {
		return sessionStorage.getItem(KEY) === '1';
	} catch {
		return false;
	}
}

export const askState = $state({ dismissed: false, read: false });

/** Reads the stored flag once, in the browser. */
export function readAskState(): void {
	if (askState.read) return;
	askState.read = true;
	if (stored()) askState.dismissed = true;
}

export function dismissAsk(): void {
	askState.dismissed = true;
	try {
		sessionStorage.setItem(KEY, '1');
	} catch {
		// Storage blocked: staying dismissed in memory is enough.
	}
}
