// Which site this build is. The same code is built twice: the plain site
// (pdf.garrettholmes.com) and the campaign site (LockUpPDFs.com), chosen at
// build time with VITE_SITE=lockup. Nothing here is decided at run time, so
// the prerendered pages carry the right title and description for each site.
//
// All campaign wording and the charity links live in this file and nowhere else.

export type SiteId = 'plain' | 'lockup';

export interface CampaignLink {
	label: string;
	// The charity's own donation page. A plain link the visitor chooses to
	// follow: no script, widget, tracker or request is made on their behalf.
	href: string;
}

export interface Campaign {
	name: string;
	title: string;
	description: string;
	// The start page (splash): the pun said straight, then the giving card.
	// The giving card reuses ask.links and ask.note.
	splash: {
		headline: string;
		tagline: string;
		body: string;
		// Under the Choose files button: drop is said only where dropping is possible
		// (a mouse and a wide screen); reassure is said everywhere.
		cta: { drop: string; reassure: string };
		give: { heading: string; lead: string };
	};
	// Shown once on the export result screen, only after the file is saved.
	ask: { lead: string; links: CampaignLink[]; note: string };
}

export const SITE_ID: SiteId = import.meta.env.VITE_SITE === 'lockup' ? 'lockup' : 'plain';

const lockup: Campaign = {
	name: 'LockUpPDFs',
	title: 'LockUpPDFs: free PDF tools with no charge at the download',
	description:
		'Combine, sign, lock and fix PDFs for free. Your files stay on your device, and nothing is charged when you download.',
	splash: {
		headline: 'Lock up PDFs.',
		tagline: 'Yes, both kinds.',
		body: 'This site fixes the document kind for free: combine, sign, shrink, no charge at the download. The other kind of PDF file belongs in prison.',
		cta: {
			drop: 'or drop files here',
			reassure: 'Free. No account. Files never leave your device.'
		},
		give: {
			heading: 'Donate to charity, not PDF software companies.',
			lead: 'Other sites charge you for the file. This one never will. Give what you would have paid to the people who protect children from the other kind.'
		}
	},
	ask: {
		lead: 'That was free. Donate to charity, not PDF software companies: give what you would have paid to child protection instead.',
		links: [
			{ label: 'Give to NCMEC', href: 'https://give.missingkids.org/' },
			{ label: 'Give to Thorn', href: 'https://www.thorn.org/donate/' }
		],
		note: 'These links go to each charity’s own donation page. No money or data passes through this site, and it is not connected to either charity.'
	}
};

// The host this build is served on, for pages that name it (the privacy page).
export const SITE_HOST = SITE_ID === 'lockup' ? 'lockuppdfs.com' : 'pdf.garrettholmes.com';

// null on the plain site: every campaign surface renders nothing.
export const campaign: Campaign | null = SITE_ID === 'lockup' ? lockup : null;
