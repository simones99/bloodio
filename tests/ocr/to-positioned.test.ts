import { describe, expect, it } from 'vitest';
import { blocksToPage, lineToItems, WORD_GAP_RATIO } from '../../src/ocr/to-positioned';
import type { OcrLine, OcrWord } from '../../src/ocr/types';

const word = (
  text: string,
  x0: number,
  x1: number,
  y0 = 100,
  y1 = 130,
  confidence = 95,
): OcrWord => ({
  text,
  confidence,
  bbox: { x0, y0, x1, y1 },
});

/** A flat line at baseline 126, 40 pixels high: words closer than 24 pixels are joined. */
const line = (words: OcrWord[], overrides: Partial<OcrLine> = {}): OcrLine => ({
  bbox: { x0: 0, y0: 96, x1: 1000, y1: 136 },
  baseline: { x0: 0, y0: 126, x1: 1000, y1: 126 },
  rowAttributes: { rowHeight: 40 },
  words,
  ...overrides,
});

describe('lineToItems', () => {
  it('joins words closer than a fraction of the line height and keeps columns apart', () => {
    expect(WORD_GAP_RATIO).toBe(0.6);
    const items = lineToItems(
      line([
        word('da', 0, 30),
        word('0,27', 42, 90),
        word('a', 102, 110, 106, 124),
        word('4,20', 122, 170),
        word('ng/ml', 300, 380),
      ]),
    );
    expect(items.map((item) => item.text)).toEqual(['da 0,27 a 4,20', 'ng/ml']);
  });

  it('places a run at its first word, on the baseline, as tall as its tallest word', () => {
    const [item] = lineToItems(
      line([word('Fino', 10, 60, 104, 128), word('77,0', 70, 120, 100, 132)]),
    );
    expect(item).toMatchObject({ text: 'Fino 77,0', x: 10, y: 126, w: 110, h: 32 });
  });

  it('reads the baseline where the run starts, for a sloped line', () => {
    const sloped = line([word('TSH', 500, 560)], {
      baseline: { x0: 0, y0: 100, x1: 1000, y1: 80 },
    });
    expect(lineToItems(sloped)[0]?.y).toBe(90);
  });

  it('gives a run the lowest confidence of its words, from 0..100 to 0..1', () => {
    const [item] = lineToItems(
      line([word('pUI', 0, 40, 100, 130, 90), word('ml', 50, 80, 100, 130, 45)]),
    );
    expect(item?.confidence).toBe(0.45);
  });

  it('measures the line by its box when tesseract gives no row height', () => {
    // A 20-pixel line: words closer than 12 pixels are joined.
    const short = { bbox: { x0: 0, y0: 100, x1: 500, y1: 120 } };
    const close = [word('a', 0, 10), word('b', 21, 30)];
    const apart = [word('a', 0, 10), word('b', 23, 30)];
    expect(lineToItems(line(close, { ...short, rowAttributes: { rowHeight: 0 } }))).toHaveLength(1);
    expect(lineToItems(line(close, { ...short, rowAttributes: undefined }))).toHaveLength(1);
    expect(lineToItems(line(apart, { ...short, rowAttributes: undefined }))).toHaveLength(2);
  });

  it('joins with the ratio it is given', () => {
    const words = [word('da', 0, 30), word('0,27', 42, 90)];
    // A 12-pixel gap on a 40-pixel line: split at 0.2 (8 px), joined at 0.6 (24 px).
    expect(lineToItems(line(words), 0.2).map((item) => item.text)).toEqual(['da', '0,27']);
    expect(lineToItems(line(words), 0.6).map((item) => item.text)).toEqual(['da 0,27']);
  });

  it('drops empty words without breaking a run', () => {
    const items = lineToItems(line([word('Fino', 0, 50), word(' ', 52, 58), word('a', 62, 70)]));
    expect(items.map((item) => item.text)).toEqual(['Fino a']);
  });
});

describe('blocksToPage', () => {
  it('reads every line of every block in order, at the image size', () => {
    const page = blocksToPage(
      [
        { paragraphs: [{ lines: [line([word('HTG', 0, 80)])] }] },
        { paragraphs: [{ lines: [line([word('TSH', 0, 80)]), line([word('FT4', 0, 80)])] }] },
      ],
      2550,
      3300,
    );
    expect(page.width).toBe(2550);
    expect(page.height).toBe(3300);
    expect(page.items.map((item) => item.text)).toEqual(['HTG', 'TSH', 'FT4']);
  });

  it('passes the ratio through a whole page, the default staying WORD_GAP_RATIO', () => {
    const blocks = [{ paragraphs: [{ lines: [line([word('da', 0, 30), word('0,27', 42, 90)])] }] }];
    expect(blocksToPage(blocks, 1000, 200, 0.2).items).toHaveLength(2);
    expect(blocksToPage(blocks, 1000, 200).items).toHaveLength(1);
  });
});
