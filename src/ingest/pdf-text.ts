import type { PositionedPage, PositionedText } from '../parsers/types';

/** The slice of pdf.js this module needs, so it can be tested with any pdf.js build. */
export interface PdfPageLike {
  getViewport(options: { scale: number }): { width: number; height: number };
  getTextContent(): Promise<{ items: unknown[] }>;
}
export interface PdfDocumentLike {
  numPages: number;
  getPage(pageNumber: number): Promise<PdfPageLike>;
}

interface PdfTextItem {
  str: string;
  transform: number[];
  width: number;
  height: number;
}

function isTextItem(item: unknown): item is PdfTextItem {
  return typeof item === 'object' && item !== null && 'str' in item && 'transform' in item;
}

const round = (n: number) => Math.round(n * 10) / 10;

/** A PDF whose pages carry fewer characters than this has no usable text layer: it is a scan. */
export const MIN_CHARS_PER_PAGE = 20;

/**
 * Reads the text layer with positions. pdf.js measures y from the bottom of the page;
 * PositionedText measures the baseline from the top, so rows read downwards.
 */
export async function pdfToPositionedText(doc: PdfDocumentLike): Promise<PositionedText> {
  const pages: PositionedPage[] = [];
  for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber++) {
    const page = await doc.getPage(pageNumber);
    const viewport = page.getViewport({ scale: 1 });
    const content = await page.getTextContent();
    const items = content.items
      .filter(isTextItem)
      .filter((item) => item.str.trim() !== '')
      .map((item) => ({
        text: item.str,
        x: round(item.transform[4] ?? 0),
        y: round(viewport.height - (item.transform[5] ?? 0)),
        w: round(item.width),
        h: round(item.height),
      }));
    pages.push({ width: viewport.width, height: viewport.height, items });
  }
  return { source: 'pdf-text', pages };
}

export function hasTextLayer(text: PositionedText): boolean {
  if (text.pages.length === 0) return false;
  const characters = text.pages.reduce(
    (sum, page) => sum + page.items.reduce((n, item) => n + item.text.trim().length, 0),
    0,
  );
  return characters / text.pages.length >= MIN_CHARS_PER_PAGE;
}
