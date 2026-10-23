import type { BBox, PositionedPage } from '../parsers/types';

/**
 * The lowest OCR confidence of the text runs whose centre falls in a row's box, edges included
 * (spec 2026-10-16 §3.1). Null when no run is there, or when any run there lacks a confidence (as on a PDF text layer): a
 * partial minimum could overstate the row's confidence.
 * A run's y is its baseline, so its centre is half a height above it.
 */
export function rowOcrConfidence(bbox: BBox, page: PositionedPage | undefined): number | null {
  if (!page) return null;
  let lowest: number | null = null;
  for (const item of page.items) {
    const x = item.x + item.w / 2;
    const y = item.y - item.h / 2;
    if (x < bbox.x || x > bbox.x + bbox.w || y < bbox.y || y > bbox.y + bbox.h) continue;
    if (item.confidence === undefined) return null;
    lowest = lowest === null ? item.confidence : Math.min(lowest, item.confidence);
  }
  return lowest;
}
