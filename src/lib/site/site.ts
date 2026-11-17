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
	// The start page poster ("Behind bars"). headline is the h1; lowercase letters stay lowercase.
	splash: {
		headline: string;
		/** The h1 while files are dragged over the page. */
		dropping: string;
		tagline: string;
		/** What the site is, said plainly right above the button. */
		statement: string;
		/** The drop area's line, shown only where a pointer can drop files. */
		drop: string;
		/**
		 * The most used tools, as chips under the button. tool is the title of the matching
		 * entry in the "What you can do" list; pictures chips open the picker for images.
		 */
		chips: { label: string; tool: string; pictures?: boolean }[];
		/** One small reassurance under the chips. */
		proof: string;
		/** The ticket stub on the giving band: a label and this site's own price. */
		fee: { label: string; amount: string };
		/** The giving band; its links are ask.links and its small print is ask.note. */
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
		headline: 'LOCK UP PDFs.',
		dropping: 'DROP THEM IN.',
		tagline: 'PDF files belong behind bars.',
		statement: 'Free PDF tools. Combine, sign, shrink, convert.',
		drop: 'or drop files here',
		chips: [
			{ label: 'Combine', tool: 'Combine files' },
			{ label: 'Fill & sign', tool: 'Fill in and sign' },
			{ label: 'Make smaller', tool: 'Make it smaller' },
			{ label: 'Pictures to PDF', tool: 'Pictures to PDF', pictures: true }
		],
		proof: 'No account. Files never leave your device.',
		fee: { label: 'Download fee', amount: '$0.00' },
		give: {
			heading: 'Donate to charity, not PDF software companies.',
			lead: 'Some sites charge for PDF files. We want PDF files charged in a court of law. Give what you would have paid to the people who protect children.'
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
