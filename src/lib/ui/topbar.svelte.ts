import type { Snippet } from 'svelte';

/**
 * The page-actions region of the top bar. A page renders <TopBarActions> with
 * its buttons (undo/redo, Export); the layout renders whatever is registered.
 * `home`: while work is open, the wordmark goes to Home through this (keeping the
 * work loaded) instead of following its link.
 */
export const topbar = $state<{ actions: Snippet | null; home: (() => void) | null }>({ actions: null, home: null });
