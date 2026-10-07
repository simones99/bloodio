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

export const center = (i: TextItem): number => i.x + i.w / 2;
