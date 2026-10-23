// Browser-only: moves a page canvas through the pure steps of preprocess.ts. Pixels are read and
// written in strips, so a full RGBA copy of a 12 MP page never exists next to the canvas.
import { IngestError } from './ingest-file';
import {
  estimateSkew,
  flattenBackground,
  grayToRgba,
  MIN_SKEW_DEGREES,
  rgbaToGray,
  sauvola,
  type GrayImage,
  type PreprocessStep,
} from './preprocess';

const STRIP_ROWS = 256;

// willReadFrequently only counts on the first getContext of a canvas. The canvases made here and by
// imageToCanvas ask for it; the ones pdf.js renders into get their context from pdf.js, which we
// leave alone.
function context2d(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const context = canvas.getContext('2d', { willReadFrequently: true });
  // Safari returns null under memory pressure: the same failure as an image that cannot be drawn.
  if (!context) throw new IngestError('unreadable');
  return context;
}

function readGray(canvas: HTMLCanvasElement): GrayImage {
  const { width, height } = canvas;
  const context = context2d(canvas);
  const data = new Uint8Array(width * height);
  for (let top = 0; top < height; top += STRIP_ROWS) {
    const rows = Math.min(STRIP_ROWS, height - top);
    rgbaToGray(context.getImageData(0, top, width, rows).data, data, top * width);
  }
  return { width, height, data };
}

function writeGray(canvas: HTMLCanvasElement, image: GrayImage): void {
  const context = context2d(canvas);
  let strip: ImageData | null = null;
  for (let top = 0; top < image.height; top += STRIP_ROWS) {
    const rows = Math.min(STRIP_ROWS, image.height - top);
    // One ImageData serves every full strip; only the last, shorter one needs its own.
    if (!strip || strip.height !== rows) strip = context.createImageData(image.width, rows);
    grayToRgba(image, top * image.width, strip.data);
    context.putImageData(strip, 0, top);
  }
}

/**
 * A copy turned by −degrees about the centre, white where the page moved away. `estimateSkew`
 * returns the angle θ by which the content is rotated; canvas rotate() is clockwise-positive in a
 * y-down frame, so turning by −θ straightens it (checked in review; do not flip the sign).
 */
function rotated(canvas: HTMLCanvasElement, degrees: number): HTMLCanvasElement {
  const out = document.createElement('canvas');
  out.width = canvas.width;
  out.height = canvas.height;
  const context = context2d(out);
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, out.width, out.height);
  context.imageSmoothingQuality = 'high';
  context.translate(out.width / 2, out.height / 2);
  context.rotate((-degrees * Math.PI) / 180);
  context.drawImage(canvas, -canvas.width / 2, -canvas.height / 2);
  return out;
}

/** A pre-processed page and the deskew angle applied to it, 0 when it was not turned. */
export interface PreprocessedPage {
  canvas: HTMLCanvasElement;
  skewDegrees: number;
}

/**
 * Applies the steps in their fixed order (light, deskew, binarize). CONSUMES `canvas`: when the page
 * is rotated the input is released (sized to 0) and a new canvas is returned, so the caller must
 * use the returned canvas only. No steps: the canvas as it is, untouched. Pixels are written back
 * only when a step changed them.
 */
export function preprocessCanvas(
  canvas: HTMLCanvasElement,
  steps: readonly PreprocessStep[],
): PreprocessedPage {
  if (steps.length === 0) return { canvas, skewDegrees: 0 };
  let page = canvas;
  let gray: GrayImage | null = readGray(page);
  let changed = false;
  let skewDegrees = 0;
  if (steps.includes('light')) {
    flattenBackground(gray);
    changed = true;
  }
  if (steps.includes('deskew')) {
    const angle = estimateSkew(gray);
    if (Math.abs(angle) >= MIN_SKEW_DEGREES) {
      if (changed) writeGray(page, gray);
      // Drop the gray buffer and release the old canvas, so one canvas and one buffer coexist.
      // eslint-disable-next-line no-useless-assignment -- releases the buffer for GC before the copy
      gray = null;
      const turned = rotated(page, angle);
      page.width = page.height = 0;
      page = turned;
      gray = readGray(page);
      changed = false;
      skewDegrees = angle;
    }
  }
  if (steps.includes('binarize')) {
    sauvola(gray);
    changed = true;
  }
  if (changed) writeGray(page, gray);
  return { canvas: page, skewDegrees };
}
