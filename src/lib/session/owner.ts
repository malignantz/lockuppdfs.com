/**
 * Which tab has a piece of saved work open. A tab holds the Web Lock
 * "pdf-workspace-project:<id>" while it has that project open; another tab sees the
 * lock (`heldElsewhere`) and shows the card as open in another tab instead of opening it.
 *
 * Without Web Locks every project counts as free; the record's writer check
 * (session.ts) then stops a second tab before it overwrites anything.
 */
import type { ProjectLock } from './session';

const PREFIX = 'pdf-workspace-project:';

const locks = () => (globalThis.navigator as (Navigator & { locks?: LockManager }) | undefined)?.locks;

/** Hold project `id` for this tab until `release`; null when another tab holds it. */
export function lockProject(id: string): Promise<ProjectLock | null> {
	const lm = locks();
	if (!lm) return Promise.resolve({ release: () => undefined });
	return new Promise<ProjectLock | null>((resolve) => {
		let release: () => void = () => undefined;
		const held = new Promise<void>((r) => (release = r));
		lm.request(PREFIX + id, { ifAvailable: true }, (lock) => {
			if (!lock) {
				resolve(null);
				return;
			}
			resolve({ release });
			return held;
		}).catch(() => resolve({ release: () => undefined }));
	});
}

/** Projects held by other tabs now (this tab's own `current` left out). */
export async function heldElsewhere(current: string | null): Promise<ReadonlySet<string>> {
	const lm = locks();
	if (!lm?.query) return new Set();
	try {
		const q = await lm.query();
		const out = new Set<string>();
		for (const l of q.held ?? []) {
			const name = l.name ?? '';
			if (name.startsWith(PREFIX)) out.add(name.slice(PREFIX.length));
		}
		if (current) out.delete(current);
		return out;
	} catch {
		return new Set();
	}
}
