/**
 * Home's card picture: the first page as shown (rotation and crop; marks are not
 * drawn), as a small JPEG of about 10 KB. Made by the app's own renderer from the
 * open work; nothing is sent anywhere.
 */
import type { Renderer } from '../core/types';
import type { DocState } from '../doc/store';

/** Width of the stored picture, in pixels (cards show it at most 180 CSS px wide). */
export const THUMB_WIDTH = 240;

export async function makeThumbnail(renderer: Renderer, st: DocState): Promise<Blob | null> {
	const p = st.pages[0];
	const source = p && st.sources.find((s) => s.id === p.sourceId);
	if (!p || !source) return null;
	const size = source.pages[p.pageIndex];
	if (!size) return null;
	const crop = p.crop ?? { x: 0, y: 0, w: 1, h: 1 };
	// Wide enough that the part shown is THUMB_WIDTH across.
	const turned = p.rotation === 90 || p.rotation === 270;
	const across = turned ? size.height / size.width : 1;
	const width = Math.min(1600, Math.ceil(THUMB_WIDTH / crop.w / across));
	const bmp = await renderer.render({ source, pageIndex: p.pageIndex, width, rotation: p.rotation, formValues: st.formValues[source.id] });
	try {
		const sx = crop.x * bmp.width;
		const sy = crop.y * bmp.height;
		const sw = Math.max(1, crop.w * bmp.width);
		const sh = Math.max(1, crop.h * bmp.height);
		const w = THUMB_WIDTH;
		const h = Math.max(1, Math.round((sh / sw) * w));
		const canvas = typeof OffscreenCanvas === 'function' ? new OffscreenCanvas(w, h) : Object.assign(document.createElement('canvas'), { width: w, height: h });
		const ctx = canvas.getContext('2d') as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;
		if (!ctx) return null;
		ctx.fillStyle = '#ffffff';
		ctx.fillRect(0, 0, w, h);
		ctx.drawImage(bmp, sx, sy, sw, sh, 0, 0, w, h);
		if ('convertToBlob' in canvas) return await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.72 });
		return await new Promise<Blob | null>((resolve) => (canvas as HTMLCanvasElement).toBlob(resolve, 'image/jpeg', 0.72));
	} finally {
		bmp.close();
	}
}
