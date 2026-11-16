// The start page's tool list, shared by the plain empty state and the campaign splash.
import type { IconName } from './icons';

// Ordered by how often people need each one (the demand table in the plan). The first
// ones are always shown; the rest fold under "More it can do", open where there is room.
export const features: { icon: IconName; title: string; line: string }[] = [
	{ icon: 'duplicate', title: 'Combine files', line: 'Merge several PDFs into one, in the order you want.' },
	{ icon: 'file', title: 'Pictures to PDF', line: 'Turn photos and scans into one PDF.' },
	{ icon: 'image', title: 'PDF to pictures', line: 'Save pages as JPG or PNG.' },
	{ icon: 'shrink', title: 'Make it smaller', line: 'Shrink a file or a scan to fit an email limit.' },
	{ icon: 'sign', title: 'Fill in and sign', line: 'Add your signature, type on the page, fill in form fields.' },
	{ icon: 'extract', title: 'Split', line: 'Save some pages as a new file, or split one into several.' },
	{ icon: 'trash', title: 'Delete and reorder pages', line: 'Drag pages into place and remove the ones you do not need.' },
	{ icon: 'lock', title: 'Unlock', line: 'Remove a password you know, or limits on printing and copying.' },
	{ icon: 'rotate-right', title: 'Rotate', line: 'Turn pages that came out sideways.' },
	{ icon: 'crop', title: 'Crop', line: 'Trim the margins of a page.' },
	{ icon: 'lock', title: 'Add a password', line: 'The file needs it to open. AES-256.' },
	{ icon: 'redact', title: 'Black out private details', line: 'Redaction that truly removes what is under the box.' },
	{ icon: 'text', title: 'Page numbers', line: 'Number the pages, or add Bates numbers.' },
	{ icon: 'text', title: 'Watermark', line: 'Text such as DRAFT across every page.' },
	{ icon: 'highlight', title: 'Mark up', line: 'Highlight, add check marks and dates.' },
	{ icon: 'zoom-in', title: 'Searchable scans', line: 'On a computer, make typed text on scanned pages searchable.' }
];

/** How many are always shown. */
export const FIRST = 8;
