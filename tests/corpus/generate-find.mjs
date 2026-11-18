#!/usr/bin/env node
// @ts-nocheck -- plain Node script like generate.mjs (which tsconfig excludes)
/**
 * Corpus for Find (src/lib/find/): an eight-page document whose words and phrases are
 * known, for the invisible text layer (the browser's own Find) and the Find bar.
 *
 *  p1  heading and a paragraph; "Amount total" ends one line and "due next month"
 *      starts the next (a phrase must not match across two lines)
 *  p2–p5 filler paragraphs; "invoice" on p2 and p4
 *  p6  "Total due: 1,250.00" (the phrase sits on a later page) and "Café crème brûlée"
 *  p7  /Rotate 90 with "quarterly report sideways"
 *  p8  no text at all
 *
 * find-none.pdf: two pages of drawn shapes and no text (not a scan either), so Find has
 * nothing to offer.
 *
 * Called from generate.mjs (one line), or on its own to (re)write only this file:
 *   node tests/corpus/generate-find.mjs
 * which merges its entry into the existing manifest.json.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PDFDocument, StandardFonts, degrees } from '@cantoo/pdf-lib';

const here = path.dirname(fileURLToPath(import.meta.url));

const FILLER = [
	'Pages arranged here stay on this device and nothing',
	'is sent anywhere while you sort, sign and export them.',
	'This paragraph only fills the page with ordinary words.'
];

export async function findText() {
	const doc = await PDFDocument.create({ updateMetadata: false });
	const font = await doc.embedFont(StandardFonts.Helvetica, { customName: 'Helvetica' });
	const lines = (page, list, x, y, size = 12, lead = 18) => list.forEach((t, i) => page.drawText(t, { x, y: y - i * lead, size, font }));

	const p1 = doc.addPage([612, 792]);
	lines(p1, ['Quarterly statement'], 72, 700, 24);
	lines(p1, ['The amount below is the Amount total', 'due next month for the account.', 'Thank you for your business.'], 72, 640);

	for (let n = 2; n <= 5; n++) {
		const p = doc.addPage([612, 792]);
		lines(p, [`Section ${n}`], 72, 700, 18);
		lines(p, FILLER, 72, 650);
		if (n === 2 || n === 4) lines(p, [`See invoice number 10${n} for details.`], 72, 560);
	}

	const p6 = doc.addPage([612, 792]);
	lines(p6, ['Summary'], 72, 700, 18);
	lines(p6, ['Total due: 1,250.00', 'Café crème brûlée for the team lunch.'], 72, 650);

	const p7 = doc.addPage([612, 792]);
	p7.setRotation(degrees(90));
	lines(p7, ['quarterly report sideways'], 72, 650, 14);

	doc.addPage([612, 792]);

	return doc.save({ useObjectStreams: false });
}

export async function findNone() {
	const doc = await PDFDocument.create({ updateMetadata: false });
	for (let n = 0; n < 2; n++) {
		const p = doc.addPage([612, 792]);
		p.drawRectangle({ x: 72, y: 500, width: 300, height: 200, borderWidth: 2 });
		p.drawCircle({ x: 300, y: 300, size: 80, borderWidth: 2 });
	}
	return doc.save({ useObjectStreams: false });
}

export default async function generateFindCorpus(write) {
	write('find-none.pdf', await findNone(), { pages: 2, note: 'Find: drawn shapes only, no text, no scan' });
	write('find-text.pdf', await findText(), {
		pages: 8,
		note: 'Find: p1 "Amount total" ends a line and "due next month" starts the next; "invoice" on p2 and p4; p6 "Total due: 1,250.00" and "Café crème brûlée"; p7 /Rotate 90 "quarterly report sideways"; p8 no text'
	});
}

// Standalone: write only this file and merge into manifest.json.
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
	const outDir = path.join(here, 'files');
	const manifestPath = path.join(outDir, 'manifest.json');
	const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
	await generateFindCorpus((name, bytes, meta) => {
		fs.writeFileSync(path.join(outDir, name), bytes);
		manifest[name] = meta;
		console.log(`${name}: ${(bytes.length / 1024).toFixed(1)} KiB`);
	});
	fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, '\t') + '\n');
}
