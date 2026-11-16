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
	// Shown on the start page, above the usual content.
	pitch: { heading: string; body: string };
	// Shown once on the export result screen, only after the file is saved.
	ask: { lead: string; links: CampaignLink[]; note: string };
}

export const SITE_ID: SiteId = import.meta.env.VITE_SITE === 'lockup' ? 'lockup' : 'plain';

const lockup: Campaign = {
	name: 'LockUpPDFs',
	title: 'LockUpPDFs: free PDF tools with no charge at the download',
	description:
		'Combine, sign, lock and fix PDFs for free. Your files stay on your device, and nothing is charged when you download.',
	pitch: {
		heading: 'Free, including the download.',
		body: 'Some PDF sites let you do the work and then charge you for the file. This one does not. It is free, and your files never leave your device.'
	},
	ask: {
		lead: 'That was free. If another site would have charged you for it, consider giving that money to child protection instead.',
		links: [
			{ label: 'Give to NCMEC', href: 'https://www.missingkids.org/supportus/donate' },
			{ label: 'Give to Thorn', href: 'https://www.thorn.org/donate/' }
		],
		note: 'These links go to each charity’s own donation page. No money or data passes through this site, and it is not connected to either charity.'
	}
};

// null on the plain site: every campaign surface renders nothing.
export const campaign: Campaign | null = SITE_ID === 'lockup' ? lockup : null;
