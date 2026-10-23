import type { BBox, PositionedPage, TextItem } from './types';

export function findItem(page: PositionedPage, pattern: RegExp): TextItem | undefined {
  return page.items.find((i) => pattern.test(i.text));
}

export function allText(page: PositionedPage): string {
  return page.items.map((i) => i.text).join('\n');
}

/** Items whose baseline falls in [anchor.y + from*h, anchor.y + to*h], h being the anchor's height. */
export function itemsNear(
  items: TextItem[],
  anchor: TextItem,
  from: number,
  to: number,
): TextItem[] {
  const lo = anchor.y + from * anchor.h;
  const hi = anchor.y + to * anchor.h;
  return items.filter((i) => i !== anchor && i.y >= lo && i.y <= hi);
}

export function joinText(items: TextItem[]): string {
  return [...items]
    .sort((a, b) => a.y - b.y || a.x - b.x)
    .map((i) => i.text.trim())
    .join(' ')
    .trim();
}

export function union(items: TextItem[]): BBox {
  const x = Math.min(...items.map((i) => i.x));
  const top = Math.min(...items.map((i) => i.y - i.h));
  const right = Math.max(...items.map((i) => i.x + i.w));
  const bottom = Math.max(...items.map((i) => i.y));
  return { x, y: top, w: right - x, h: bottom - top };
}

/** A row's box grown to hold one more item, e.g. a reference line continuing below the row. */
export function grow(box: BBox, item: TextItem): BBox {
  return union([{ text: '', x: box.x, y: box.y + box.h, w: box.w, h: box.h }, item]);
}

/**
 * How far, in line heights of the name, a row's value, unit and reference may sit from the name's baseline and
 * still count as on its line (isAligned). On a tilted photo every value may move one line down, each
 * row taking the value above; such a row is never trusted (beyond spec 2026-10-16 §6.2, recorded in
 * Task 17). Measured on the fixtures: text layer, value at most 0.05 and unit at most 0.26; OCR,
 * value at most 0.25 and unit up to 0.67 (tesseract sets the unit higher). The reference: at most
 * 0.26 in the text layer, 0.54 in OCR; at 0.8 a reference taken from the line above at 0.7 still
 * passes, and only a tolerance between 0.54 and 0.7 would catch it. A line is 1.4 line
 * heights apart in the text layer and about 2 in OCR, so a one-line shift is outside both. The OCR
 * sample is 6 rows only: Tasks 14 and 16 re-check these on the measured corpus.
 *
 * Not done: distrusting a page where a catalog name was dropped as a heading for want of a value.
 * The adapters do not look such names up in the catalog (only those with a reference or unit
 * nearby), and buildDraftReport has no page-level input for it; isAligned already catches a shift.
 */
export const VALUE_ALIGN_TOLERANCE = 0.35;
export const UNIT_ALIGN_TOLERANCE = 0.8;
export const REF_ALIGN_TOLERANCE = UNIT_ALIGN_TOLERANCE;

/**
 * The largest distance of the items' baselines from the anchor's, in anchor heights. Infinity for
 * no items or an anchor without height: nothing can be said to be aligned then.
 */
export function lineOffset(anchor: TextItem, items: readonly TextItem[]): number {
  if (items.length === 0 || !(anchor.h > 0)) return Infinity;
  const offset = Math.max(...items.map((i) => Math.abs(i.y - anchor.y))) / anchor.h;
  return Number.isNaN(offset) ? Infinity : offset;
}

/**
 * Whether a row's value, and its unit and reference if any, sit on the name's line
 * (VALUE_ALIGN_TOLERANCE, REF_ALIGN_TOLERANCE). `ref` is what the row read on its own line, never the
 * continuation lines attached below it afterwards.
 */
export function isAligned(
  name: TextItem,
  value: readonly TextItem[],
  unit: readonly TextItem[],
  ref: readonly TextItem[],
): boolean {
  if (lineOffset(name, value) > VALUE_ALIGN_TOLERANCE) return false;
  if (unit.length > 0 && lineOffset(name, unit) > UNIT_ALIGN_TOLERANCE) return false;
  return ref.length === 0 || lineOffset(name, ref) <= REF_ALIGN_TOLERANCE;
}

export const center = (i: TextItem): number => i.x + i.w / 2;
