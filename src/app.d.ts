// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
declare global {
	namespace App {
		interface Error {
			message: string;
			/** The real error, described for a bug report (see hooks.client.ts). */
			detail?: string;
		}
		// interface Locals {}
		// interface PageData {}
		interface PageState {
			/** Work is open (a history entry above Home, so Back goes Home). */
			view?: 'project';
		}
		// interface Platform {}
	}
}

export {};
