import { readFileSync } from 'node:fs';
import { blocksToPage } from '../../src/ocr/to-positioned';
import type { OcrBlock } from '../../src/ocr/types';
import type { PositionedText } from '../../src/parsers/types';

export const FIXTURE_NAMES = [
  'proavis-2022-08-20',
  'proavis-2021-10-04',
  'proavis-2021-07-10',
  'ast-2021-08-30',
] as const;

export type FixtureName = (typeof FIXTURE_NAMES)[number];

export function loadFixture(name: FixtureName): PositionedText {
  return JSON.parse(
    readFileSync(`tests/fixtures/positioned/${name}.json`, 'utf8'),
  ) as PositionedText;
}

export const OCR_FIXTURE_NAMES = ['proavis-2021-07-10'] as const;

export type OcrFixtureName = (typeof OCR_FIXTURE_NAMES)[number];

/**
 * tesseract.js's reading of a fixture drawn as a 300 DPI scan (scripts/make-ocr-fixture.mjs),
 * turned into positioned text the way the app does it.
 */
export function loadOcrFixture(name: OcrFixtureName): PositionedText {
  const { width, height, blocks } = JSON.parse(
    readFileSync(`tests/fixtures/ocr/${name}.json`, 'utf8'),
  ) as { width: number; height: number; blocks: OcrBlock[] };
  return { source: 'ocr', pages: [blocksToPage(blocks, width, height)] };
}
