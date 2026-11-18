/**
 * The Find bar's state, shared by the page grid and the page editor (the bar opened in
 * one stays open, with its words, in the other), and what the page tiles and text
 * layers read from it to mark matches.
 */
import type { PageId } from '../core/types';

export interface LayerHit {
	line: number;
	start: number;
	end: number;
	current: boolean;
}

/** CSS Custom Highlight API (Chrome 105, Safari 17.2, Firefox 140). Without it the layer marks matches itself. */
export const highlightApi = typeof CSS !== 'undefined' && typeof Highlight === 'function' && 'highlights' in CSS;

class FindState {
	open = $state(false);
	query = $state('');
	/** Matches per page, for the grid's marks. */
	pages = $state.raw<ReadonlyMap<PageId, number>>(new Map());
	/** Page of the current match. */
	currentPage = $state<PageId | null>(null);
	/** Without the Custom Highlight API: the matches each layer paints itself. */
	layerHits = $state.raw<ReadonlyMap<PageId, LayerHit[]>>(new Map());

	clearMarks() {
		this.pages = new Map();
		this.currentPage = null;
		this.layerHits = new Map();
	}
}

export const find = new FindState();
