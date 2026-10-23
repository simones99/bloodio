import { IngestError, type OpenPdf, type SourceFile } from './ingest-file';
import type { PageGeometry } from './page-geometry';
import type { PdfDocumentLike } from './pdf-text';
import { PREPROCESS_STEPS, type PreprocessStep } from './preprocess';
import { preprocessCanvas } from './preprocess-canvas';

/** The long side of a page image, at most: a 12-megapixel photo would exhaust a phone's memory. */
export const MAX_SIDE = 3500;
/** PDF pages render at about 300 DPI, where tesseract reads best. */
export const PDF_SCALE = 300 / 72;

/** The scale to draw a page at: `preferred`, reduced so the long side fits MAX_SIDE. */
export function pageScale(width: number, height: number, preferred: number): number {
  return Math.min(preferred, MAX_SIDE / Math.max(width, height));
}

/** A page the OCR reads, and how it was made from the original (spec 2026-10-22 §3.2). */
export interface RenderedPage {
  canvas: HTMLCanvasElement;
  geometry: PageGeometry;
}

/** Turns the chosen files into the images the OCR reads. Faked in tests. */
export interface PageRenderer {
  /** One page per image, in the given order. Throws IngestError for an image it cannot open. */
  fromImages(files: File[]): Promise<RenderedPage[]>;
  /** One page per page of a PDF without a text layer. */
  fromPdf(doc: PdfDocumentLike): Promise<RenderedPage[]>;
  /** The zero-based `page` of the chosen files as printed, for "Vedi originale". */
  original(files: SourceFile[], page: number): Promise<HTMLCanvasElement>;
}

/** A page drawn from the original, before pre-processing: its size in its own units, and the scale. */
interface DrawnPage {
  canvas: HTMLCanvasElement;
  width: number;
  height: number;
  scale: number;
}

const isHeic = (file: File) => /^image\/hei[cf]$/.test(file.type) || /\.hei[cf]$/i.test(file.name);

function blankCanvas(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width));
  canvas.height = Math.max(1, Math.round(height));
  return canvas;
}

async function imageToCanvas(file: File): Promise<DrawnPage> {
  let bitmap: ImageBitmap;
  try {
    try {
      // from-image: a phone photo carries its rotation in EXIF.
      bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
    } catch (error) {
      // A browser that does not know 'from-image' throws a TypeError; it is the default there anyway.
      if (!(error instanceof TypeError)) throw error;
      bitmap = await createImageBitmap(file);
    }
  } catch {
    throw new IngestError(isHeic(file) ? 'heic-unsupported' : 'unreadable');
  }
  try {
    const scale = pageScale(bitmap.width, bitmap.height, 1);
    const canvas = blankCanvas(bitmap.width * scale, bitmap.height * scale);
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) throw new IngestError('unreadable');
    // White under a transparent PNG: tesseract reads dark text on a light page.
    // willReadFrequently: pre-processing reads the pixels back, and the hint only counts at creation.
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    // High quality: photos are shrunk by about 0.4 and low-quality smoothing aliases small text.
    context.imageSmoothingQuality = 'high';
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    return { canvas, width: bitmap.width, height: bitmap.height, scale };
  } finally {
    bitmap.close();
  }
}

async function pdfPageToCanvas(doc: PdfDocumentLike, pageNumber: number): Promise<DrawnPage> {
  const page = await doc.getPage(pageNumber);
  const natural = page.getViewport({ scale: 1 });
  const scale = pageScale(natural.width, natural.height, PDF_SCALE);
  const viewport = page.getViewport({ scale });
  const canvas = blankCanvas(viewport.width, viewport.height);
  try {
    await page.render({ canvas, viewport }).promise;
  } finally {
    page.cleanup?.();
  }
  return { canvas, width: natural.width, height: natural.height, scale };
}

async function pdfToCanvases(doc: PdfDocumentLike): Promise<DrawnPage[]> {
  const pages: DrawnPage[] = [];
  for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber++) {
    pages.push(await pdfPageToCanvas(doc, pageNumber));
  }
  return pages;
}

/** Pre-processes a drawn page and records how the canvas the OCR reads came from the original. */
function preprocessed(drawn: DrawnPage, steps: readonly PreprocessStep[]): RenderedPage {
  const { canvas, skewDegrees } = preprocessCanvas(drawn.canvas, steps);
  const { width, height, scale } = drawn;
  return { canvas, geometry: { width, height, scale, quarterTurns: 0, skewDegrees } };
}

/** The import closed its document: the PDF is opened again from the bytes kept in memory. */
async function pdfOriginal(
  openPdf: OpenPdf,
  file: SourceFile,
  page: number,
): Promise<HTMLCanvasElement> {
  // pdf.js takes ownership of the buffer it is given, so it gets a copy.
  const doc = await openPdf(file.data.slice(0));
  try {
    return (await pdfPageToCanvas(doc, page + 1)).canvas;
  } finally {
    void doc.destroy?.()?.catch(() => {});
  }
}

/**
 * Browser-only: canvas and createImageBitmap. `steps` are the pre-processing (spec 2026-10-16 §4);
 * `openPdf` draws the original of a PDF, and without it there is none.
 */
export function createPageRenderer(
  steps: readonly PreprocessStep[] = PREPROCESS_STEPS,
  openPdf?: OpenPdf,
): PageRenderer {
  return {
    fromImages: async (files) => {
      // One at a time: several full-resolution photos must never be decoded together.
      const pages: RenderedPage[] = [];
      for (const file of files) pages.push(preprocessed(await imageToCanvas(file), steps));
      return pages;
    },
    fromPdf: async (doc) => (await pdfToCanvases(doc)).map((drawn) => preprocessed(drawn, steps)),
    original: async (files, page) => {
      const pdf = files.find((file) => file.mimeType === 'application/pdf');
      if (pdf) {
        if (!openPdf) throw new Error('This renderer cannot open a PDF');
        return pdfOriginal(openPdf, pdf, page);
      }
      const image = files[page];
      if (!image) throw new Error(`There is no page ${page}`);
      // The same decoding as the import, without pre-processing: the photo as it was taken.
      const file = new File([image.data], image.fileName, { type: image.mimeType });
      return (await imageToCanvas(file)).canvas;
    },
  };
}
