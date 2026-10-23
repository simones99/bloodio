import type { PositionedPage, TextItem } from '../parsers/types';
import type { OcrBlock, OcrLine, OcrWord } from './types';

/**
 * Words of one tesseract line closer than this many line heights form one text run, like the runs
 * pdf.js gives: "da 0,27 a 4,20" stays one reference, while the gap between columns splits it from
 * the unit. The line height, not the word height: a short word like "a" would split the run.
 */
export const WORD_GAP_RATIO = 0.6;

const round = (n: number) => Math.round(n * 10) / 10;

function lineHeight(line: OcrLine): number {
  const row = line.rowAttributes?.rowHeight ?? 0;
  return row > 0 ? row : line.bbox.y1 - line.bbox.y0;
}

/** tesseract fits one baseline to the whole line, which spans every column: read it at x. */
function baselineAt(line: OcrLine, x: number): number {
  const { x0, y0, x1, y1 } = line.baseline;
  return x1 === x0 ? y0 : y0 + ((y1 - y0) * (x - x0)) / (x1 - x0);
}

function toItem(line: OcrLine, words: OcrWord[]): TextItem {
  const left = Math.min(...words.map((word) => word.bbox.x0));
  const right = Math.max(...words.map((word) => word.bbox.x1));
  return {
    text: words.map((word) => word.text.trim()).join(' '),
    x: round(left),
    y: round(baselineAt(line, left)),
    w: round(right - left),
    h: round(Math.max(...words.map((word) => word.bbox.y1 - word.bbox.y0))),
    confidence: Math.min(...words.map((word) => word.confidence)) / 100,
  };
}

export function lineToItems(line: OcrLine, ratio = WORD_GAP_RATIO): TextItem[] {
  const maxGap = ratio * lineHeight(line);
  const runs: OcrWord[][] = [];
  for (const word of line.words) {
    if (word.text.trim() === '') continue;
    const run = runs.at(-1);
    const previous = run?.at(-1);
    if (run && previous && word.bbox.x0 - previous.bbox.x1 < maxGap) run.push(word);
    else runs.push([word]);
  }
  return runs.map((run) => toItem(line, run));
}

/**
 * One recognised image as a page of positioned text, in the image's pixels. `ratio` is the word
 * gap that still joins words, in line heights; the measuring tool tries several.
 */
export function blocksToPage(
  blocks: OcrBlock[],
  width: number,
  height: number,
  ratio = WORD_GAP_RATIO,
): PositionedPage {
  const items = blocks.flatMap((block) =>
    block.paragraphs.flatMap((paragraph) =>
      paragraph.lines.flatMap((line) => lineToItems(line, ratio)),
    ),
  );
  return { width, height, items };
}
