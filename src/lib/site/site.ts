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
	// The name as the top bar sets it: the second part sits on the orange chip.
	wordmark: [string, string];
	title: string;
	description: string;
	// The start page: a booking photo of a PDF, the headline, and the giving band.
	splash: {
		// Two lines; the second is the one set on the orange band.
		headline: [string, string];
		sub: string;
		// The picture's text alternative.
		photoLabel: string;
		// The letter board the PDF holds. The last line is split so its last word can be orange.
		placard: { header: string; lines: [string, string]; charge: [string, string] };
		// The giving band, styled as an evidence tag. It uses ask.links and ask.note below.
		give: { tag: string; heading: string; lead: string };
		// Over the tool list ("What you can do").
		rapSheet: string;
		// Each entry of the tool list is numbered like a count on a charge sheet.
		count: string;
	};
	// The link preview image (design/lockup/share.html, rendered by scripts/make-lockup-assets.mjs).
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
		headline: ['PDFs.', 'Locked up.'],
		sub: 'Free PDF tools with no charge at the download.',
		photoLabel:
			'A booking photo of a PDF document standing against a height chart, holding a letter board that reads: PDF file, locked up, charge: none.',
		placard: { header: 'LOCKUPPDFS.COM', lines: ['PDF FILE', 'LOCKED UP'], charge: ['CHARGE:', 'NONE'] },
		give: {
			tag: 'Exhibit A',
			heading: 'The money you saved',
			lead: 'Other sites charge you for the file. This one is free. Give what you saved to the people who protect children from the other kind of PDF file.'
		},
		rapSheet: 'Rap sheet',
		count: 'Count'
	},
	share: {
		line: 'Free PDF tools. Charge: none.',
		alt: 'A booking photo of a PDF document holding a letter board: PDF file, locked up, charge: none. Beside it: PDFs. Locked up. Free PDF tools. Charge: none. lockuppdfs.com'
	},
	ask: {
		lead: 'That was free. Charge: none. If another site would have charged you for it, consider giving that money to child protection instead.',
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
