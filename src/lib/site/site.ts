// Which site this build is. The same code is built twice: the plain site
// (pdf.garrettholmes.com) and the campaign site (LockUpPDFs.com), chosen at
// build time with VITE_SITE=lockup. Nothing here is decided at run time, so
// the prerendered pages carry the right title and description for each site.
//
// All campaign wording and the charity link live in this file and nowhere else.

export type SiteId = 'plain' | 'lockup';

export interface CampaignLink {
	label: string;
	// The charity's own donation page. A plain link the visitor chooses to
	// follow: no script, widget, tracker or request is made on their behalf.
	href: string;
}

export interface Campaign {
	name: string;
	/** The top bar's wordmark; the second part is set on the orange tag. */
	wordmark: [string, string];
	title: string;
	description: string;
	// The start page ("Booking photo"): a booking photo of a PDF, the headline, the one
	// button, the giving band, then the tool list as a rap sheet.
	splash: {
		/** The h1, two lines; the second is set on the orange band. */
		headline: [string, string];
		/** The h1 while files are dragged over the page. */
		dropping: string;
		/** The booking photo's text alternative. */
		photoLabel: string;
		/** The letter board the PDF holds. The last line is split so its last word can be orange. */
		placard: { header: string; lines: [string, string]; fee: [string, string] };
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
		/** The giving band, an evidence tag. Its links are ask.links and its small print is ask.note. */
		give: { tag: string; heading: string; lead: string };
		/** The label over the tool list ("What you can do"), and the one on each numbered entry. */
		rapSheet: string;
		count: string;
	};
	/** This site's own price, on the note after a download. */
	fee: { label: string; amount: string };
	// The link preview image (design/lockup/og.html, rendered by scripts/make-lockup-art.mjs).
	share: { line: string; alt: string };
	// Shown once on the export result screen, only after the file is saved.
	ask: { lead: string; links: CampaignLink[]; note: string };
}

export const SITE_ID: SiteId = import.meta.env.VITE_SITE === 'lockup' ? 'lockup' : 'plain';

const lockup: Campaign = {
	name: 'LockUpPDFs',
	wordmark: ['LockUp', 'PDFs'],
	title: 'LockUpPDFs: free PDF tools with no charge at the download',
	description:
		'Combine, sign, lock and fix PDFs for free. Your files stay on your device, and nothing is charged when you download.',
	splash: {
		headline: ['PDF files.', 'Locked up.'],
		dropping: 'Drop them in.',
		photoLabel:
			'A booking photo of a PDF document standing against a height chart, holding a letter board that reads: PDF file, locked up, fee: $0.00.',
		// "FEE", not "CHARGE": the giving lead wants PDF files charged in court, so the board
		// only says what the download costs.
		placard: { header: 'LOCKUPPDFS.COM', lines: ['PDF FILE', 'LOCKED UP'], fee: ['FEE:', '$0.00'] },
		statement: 'Free PDF tools. Combine, sign, shrink, convert, redact.',
		drop: 'or drop files here',
		chips: [
			{ label: 'Combine', tool: 'Combine files' },
			{ label: 'Fill & sign', tool: 'Fill in and sign' },
			{ label: 'Make smaller', tool: 'Make it smaller' },
			{ label: 'Pictures to PDF', tool: 'Pictures to PDF', pictures: true }
		],
		proof: 'No account. Files never leave your device.',
		give: {
			tag: 'Exhibit A',
			heading: 'Donate to charity, not PDF software companies.',
			lead: 'Some sites charge for PDF files. We want PDF files charged in a court of law. Give what you would have paid to the people who protect children.'
		},
		rapSheet: 'Rap sheet',
		count: 'Count'
	},
	fee: { label: 'Download fee', amount: '$0.00' },
	share: {
		line: 'Free PDF tools. Combine, sign, shrink, convert, redact.',
		alt: 'A booking photo of a PDF document holding a letter board: PDF file, locked up, fee: $0.00. Beside it: PDF files. Locked up. Free PDF tools. lockuppdfs.com'
	},
	ask: {
		lead: 'That was free. Donate to charity, not PDF software companies: give what you would have paid to child protection instead.',
		links: [
			// One link on purpose: every gift counts toward the one fundraiser.
			{ label: 'Give to NCMEC', href: 'https://give.missingkids.org/LockUpPDFs' }
		],
		note: 'This link goes to the LockUpPDFs fundraiser on the charity’s own donation site. No money or data passes through this site, and the fundraiser is a supporter’s own, not run by the charity.'
	}
};

// The host this build is served on, for pages that name it (the privacy page).
export const SITE_HOST = SITE_ID === 'lockup' ? 'lockuppdfs.com' : 'pdf.garrettholmes.com';

// null on the plain site: every campaign surface renders nothing.
export const campaign: Campaign | null = SITE_ID === 'lockup' ? lockup : null;
