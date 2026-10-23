import { describe, expect, it } from 'vitest';
import { rowOcrConfidence } from '../../src/ocr/row-confidence';
import type { PositionedPage, TextItem } from '../../src/parsers/types';

const item = (x: number, y: number, w: number, h: number, confidence?: number): TextItem => ({
  text: 'x',
  x,
  y,
  w,
  h,
  confidence,
});

/** A row box from y 15 to 45: an item's centre is (x + w/2, y - h/2), y being its baseline. */
const BOX = { x: 0, y: 15, w: 200, h: 30 };

describe('rowOcrConfidence', () => {
  it('is the lowest confidence of the words whose centre is in the box', () => {
    const page: PositionedPage = {
      width: 500,
      height: 500,
      items: [item(10, 40, 50, 20, 0.95), item(100, 40, 30, 20, 0.81), item(10, 300, 50, 20, 0.2)],
    };
    expect(rowOcrConfidence(BOX, page)).toBe(0.81);
  });

  it('counts a centre that sits on the edge of the box', () => {
    const page: PositionedPage = { width: 500, height: 500, items: [item(-10, 55, 20, 20, 0.5)] };
    expect(rowOcrConfidence(BOX, page)).toBe(0.5);
  });

  it('is null without words that carry a confidence', () => {
    const textLayer: PositionedPage = { width: 500, height: 500, items: [item(10, 40, 50, 20)] };
    expect(rowOcrConfidence(BOX, textLayer)).toBeNull();
    expect(rowOcrConfidence(BOX, { width: 500, height: 500, items: [] })).toBeNull();
    expect(rowOcrConfidence(BOX, undefined)).toBeNull();
  });

  it('is null when any word in the box has no confidence', () => {
    const page: PositionedPage = {
      width: 500,
      height: 500,
      items: [item(10, 40, 50, 20, 0.95), item(100, 40, 30, 20)],
    };
    expect(rowOcrConfidence(BOX, page)).toBeNull();
  });

  it('is lowered by a neighbouring row word whose centre is just inside the box edge', () => {
    const page: PositionedPage = {
      width: 500,
      height: 500,
      // centre y = 55 - 10 = 45, the bottom edge of BOX, though the word belongs to the next row
      items: [item(10, 40, 50, 20, 0.95), item(10, 55, 50, 20, 0.3)],
    };
    expect(rowOcrConfidence(BOX, page)).toBe(0.3);
  });
});
