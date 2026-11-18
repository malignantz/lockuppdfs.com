/** DocStore.markForBlackout / dropBlackoutTerm and DocState.blackout (2026-11-18). */
import { describe, expect, it } from 'vitest';
import { checkInvariants, makeSource, makeStore } from './helpers';

const b = (x: number) => ({ x, y: 0.1, w: 0.1, h: 0.02 });

function setup() {
	const ctx = makeStore();
	ctx.store.addSource(makeSource('a', 3));
	return ctx;
}

describe('markForBlackout', () => {
	it('adds ordinary redaction boxes on several pages and remembers the word, as one step', () => {
		const { store } = setup();
		const [p0, , p2] = store.state.pages.map((p) => p.id);
		const ids = store.markForBlackout('  Jane   Doe ', [
			{ pageId: p0, box: b(0.1) },
			{ pageId: p0, box: b(0.3) },
			{ pageId: p2, box: b(0.5) }
		]);
		expect(ids).toHaveLength(3);
		expect(store.state.pages[0].stamps).toEqual([
			{ id: ids[0], kind: 'redact', box: b(0.1) },
			{ id: ids[1], kind: 'redact', box: b(0.3) }
		]);
		expect(store.state.pages[2].stamps).toEqual([{ id: ids[2], kind: 'redact', box: b(0.5) }]);
		expect(store.state.blackout).toEqual(['Jane Doe']);
		expect(store.undoLabel).toBe('Mark 3 for blackout');
		checkInvariants(store);

		store.undo();
		expect(store.state.pages.every((p) => p.stamps.length === 0)).toBe(true);
		expect(store.state.blackout).toEqual([]);
		store.redo();
		expect(store.state.blackout).toEqual(['Jane Doe']);
		expect(store.state.pages[0].stamps).toHaveLength(2);
	});

	it('keeps one entry per word as the check folds it', () => {
		const { store } = setup();
		const p0 = store.state.pages[0].id;
		store.markForBlackout('Jane Doe', [{ pageId: p0, box: b(0.1) }]);
		store.markForBlackout('jane  DOE', [{ pageId: p0, box: b(0.3) }]);
		store.markForBlackout('Acme', [{ pageId: p0, box: b(0.5) }]);
		expect(store.state.blackout).toEqual(['Jane Doe', 'Acme']);
		// Marking a known word again with nothing to add changes nothing.
		expect(store.markForBlackout('ACME', [])).toEqual([]);
		expect(store.undoLabel).toBe('Mark 1 for blackout');
	});

	it('refuses bad input and changes nothing', () => {
		const { store } = setup();
		const before = store.state;
		const p0 = store.state.pages[0].id;
		expect(() => store.markForBlackout('  ', [{ pageId: p0, box: b(0.1) }])).toThrow();
		expect(() => store.markForBlackout('x', [{ pageId: 'nope', box: b(0.1) }])).toThrow();
		expect(() => store.markForBlackout('x', [{ pageId: p0, box: { x: 0.95, y: 0, w: 0.1, h: 0.1 } }])).toThrow();
		expect(() => store.markForBlackout('x', [{ pageId: p0, box: { x: 0, y: 0, w: 0, h: 0.1 } }])).toThrow();
		expect(store.state).toBe(before);
	});

	it('drops a word from the check (boxes stay), undoably', () => {
		const { store } = setup();
		const p0 = store.state.pages[0].id;
		store.markForBlackout('Jane Doe', [{ pageId: p0, box: b(0.1) }]);
		expect(store.dropBlackoutTerm('JANE doe')).toBe(true);
		expect(store.state.blackout).toEqual([]);
		expect(store.state.pages[0].stamps).toHaveLength(1);
		expect(store.undoLabel).toBe('Stop checking for “JANE doe”');
		expect(store.dropBlackoutTerm('Jane Doe')).toBe(false);
		store.undo();
		expect(store.state.blackout).toEqual(['Jane Doe']);
	});

	it('words go with the document’s last page, and are restored with saved work', () => {
		const { store } = setup();
		const p0 = store.state.pages[0].id;
		store.markForBlackout('Jane Doe', [{ pageId: p0, box: b(0.1) }]);
		store.removePages(store.state.pages.map((p) => p.id));
		expect(store.state.blackout).toEqual([]);
		store.undo();
		expect(store.state.blackout).toEqual(['Jane Doe']);

		const s = store.state;
		const { store: other } = makeStore();
		other.restore({ sources: s.sources, pages: s.pages, assets: s.assets, formValues: s.formValues, blackout: ['Jane Doe', 'jane doe', 'Acme'] });
		expect(other.state.blackout).toEqual(['Jane Doe', 'Acme']);
		other.restore({ sources: s.sources, pages: s.pages, assets: s.assets, formValues: s.formValues });
		expect(other.state.blackout).toEqual([]);
		expect(() => other.restore({ sources: s.sources, pages: s.pages, assets: s.assets, formValues: s.formValues, blackout: [' '] })).toThrow();
	});
});
