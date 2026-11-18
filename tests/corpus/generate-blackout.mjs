#!/usr/bin/env node
// @ts-nocheck -- plain Node script like generate.mjs (which tsconfig excludes)
/**
 * Corpus for "Mark for blackout" (find/blackout.ts, engine/blackout.ts).
 *
 * blackout-names.pdf, four pages, the name "Jane Doe" five times:
 *  p1  "Claim for Jane Doe, policy 4471." and "Jane Doe signed below."   (two in lines)
 *  p2  "Witness: Jane Doe"                                                (one)
 *  p3  "...was reviewed by Jane" / "Doe on Monday morning."               (wrapped: Find cannot see it)
 *  p4  "Copy to Jane Doe and the file."                                   (one)
 * Find sees four matches on three pages; the export's check also sees the wrapped one.
 *
 * blackout-hidden.pdf, where the name hides from Find:
 *  p1  a text form field whose value is "Jane Doe" (page text: "Name:")
 *  p2  a sticky-note comment whose contents are "Call Jane Doe" (page text: "Notes")
 *  p3  a picture and no text at all
 *  p4  "Jane Doe" below the CropBox (the visible part shows "Visible part")
 *  p5  "Jane Do-" / "e agreed." (a hyphenated line end)
 *
 * Called from generate.mjs (one line), or on its own: node tests/corpus/generate-blackout.mjs
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
	PDFDocument,
	PDFName,
	PDFString,
	StandardFonts,
	concatTransformationMatrix,
	drawObject,
	popGraphicsState,
	pushGraphicsState
} from '@cantoo/pdf-lib';

const here = path.dirname(fileURLToPath(import.meta.url));

export async function blackoutNames() {
	const doc = await PDFDocument.create({ updateMetadata: false });
	const font = await doc.embedFont(StandardFonts.Helvetica, { customName: 'Helvetica' });
	const lines = (page, list, x, y, size = 12, lead = 18) => list.forEach((t, i) => page.drawText(t, { x, y: y - i * lead, size, font }));

	const p1 = doc.addPage([612, 792]);
	lines(p1, ['Claim statement'], 72, 700, 20);
	lines(p1, ['Claim for Jane Doe, policy 4471.', 'The claim was received in full.', 'Jane Doe signed below.'], 72, 650);

	const p2 = doc.addPage([612, 792]);
	lines(p2, ['Witnesses'], 72, 700, 18);
	lines(p2, ['Witness: Jane Doe', 'Witness: Sam Lee'], 72, 650);

	const p3 = doc.addPage([612, 792]);
	lines(p3, ['Review'], 72, 700, 18);
	lines(p3, ['The claim file was reviewed by Jane', 'Doe on Monday morning.', 'No further action was needed.'], 72, 650);

	const p4 = doc.addPage([612, 792]);
	lines(p4, ['Distribution'], 72, 700, 18);
	lines(p4, ['Copy to Jane Doe and the file.'], 72, 650);

	return doc.save({ useObjectStreams: false });
}

export async function blackoutHidden() {
	const doc = await PDFDocument.create({ updateMetadata: false });
	const font = await doc.embedFont(StandardFonts.Helvetica, { customName: 'Helvetica' });
	const ctx = doc.context;

	const p1 = doc.addPage([612, 792]);
	p1.drawText('Name:', { x: 72, y: 700, size: 12, font });
	const field = doc.getForm().createTextField('applicant');
	field.setText('Jane Doe');
	field.addToPage(p1, { x: 120, y: 690, width: 200, height: 22, font });

	const p2 = doc.addPage([612, 792]);
	p2.drawText('Notes', { x: 72, y: 700, size: 12, font });
	const note = ctx.register(
		ctx.obj({ Type: 'Annot', Subtype: 'Text', Rect: [72, 600, 92, 620], Contents: PDFString.of('Call Jane Doe'), Name: 'Comment', F: 4 })
	);
	p2.node.set(PDFName.of('Annots'), ctx.obj([note]));

	const p3 = doc.addPage([612, 792]);
	const w = 64;
	const h = 64;
	const px = new Uint8Array(w * h);
	for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) px[y * w + x] = (x ^ y) & 8 ? 40 : 220;
	const img = ctx.register(ctx.flateStream(px, { Type: 'XObject', Subtype: 'Image', Width: w, Height: h, ColorSpace: 'DeviceGray', BitsPerComponent: 8 }));
	const name = p3.node.newXObject('Im', img);
	p3.pushOperators(pushGraphicsState(), concatTransformationMatrix(468, 0, 0, 648, 72, 72), drawObject(name), popGraphicsState());

	const p4 = doc.addPage([612, 792]);
	p4.drawText('Visible part', { x: 72, y: 700, size: 12, font });
	p4.drawText('Jane Doe', { x: 72, y: 100, size: 12, font });
	p4.setCropBox(0, 400, 612, 392);

	const p5 = doc.addPage([612, 792]);
	p5.drawText('Jane Do-', { x: 72, y: 700, size: 12, font });
	p5.drawText('e agreed.', { x: 72, y: 682, size: 12, font });

	return doc.save({ useObjectStreams: false });
}

export default async function generateBlackoutCorpus(write) {
	write('blackout-names.pdf', await blackoutNames(), {
		pages: 4,
		note: 'Mark for blackout: "Jane Doe" twice on p1, once on p2 and p4 (Find sees 4 on 3 pages); p3 wraps it across two lines'
	});
	write('blackout-hidden.pdf', await blackoutHidden(), {
		pages: 5,
		note: 'Mark for blackout: "Jane Doe" in a form field (p1), a comment (p2), below the crop (p4), hyphenated (p5); p3 a picture with no text'
	});
}

// Standalone: write only these files and merge into manifest.json.
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
	const outDir = path.join(here, 'files');
	const manifestPath = path.join(outDir, 'manifest.json');
	const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
	await generateBlackoutCorpus((name, bytes, meta) => {
		fs.writeFileSync(path.join(outDir, name), bytes);
		manifest[name] = meta;
		console.log(`${name}: ${(bytes.length / 1024).toFixed(1)} KiB`);
	});
	fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, '\t') + '\n');
}
