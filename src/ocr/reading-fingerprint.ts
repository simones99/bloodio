import { MAX_SIDE, PDF_SCALE } from '../ingest/image-pages';
import { PREPROCESS_PARAMS } from '../ingest/preprocess';
import { OCR_ENGINE_MODE, OCR_LANGUAGES } from './assets';
import { WORD_GAP_RATIO } from './to-positioned';

export interface ReadingSettings {
  languages: string;
  engineMode: number;
  maxSide: number;
  pdfScale: number;
  wordGapRatio: number;
  preprocess: Readonly<Record<keyof typeof PREPROCESS_PARAMS, number>>;
}

/**
 * The numbers that change what the app reads from a page, beyond the tesseract files (ocrHash) and
 * the choice of pre-processing steps (PREPROCESS_STEPS). An OCR trust threshold holds only for the
 * settings it was measured with (spec 2026-10-16 §6.4).
 *
 * Not here: tesseract's page segmentation mode, which the app leaves at tesseract.js's default, so
 * it changes only with tesseract.js's worker and core, which ocrHash covers. Nor can a fingerprint
 * see a change to the code itself: the pre-processing algorithms, the conversion of words into runs
 * (to-positioned.ts) and above all the lab adapters' layout rules. Whoever changes those re-measures
 * or sets OCR_TRUST back to null.
 */
export const READING_SETTINGS: Readonly<ReadingSettings> = Object.freeze({
  languages: OCR_LANGUAGES,
  engineMode: OCR_ENGINE_MODE,
  maxSide: MAX_SIDE,
  pdfScale: PDF_SCALE,
  wordGapRatio: WORD_GAP_RATIO,
  preprocess: PREPROCESS_PARAMS,
});

/** The settings as one string, for OcrTrust.measuredWith.reading; the measuring tool records it. */
export function readingFingerprint(settings: Readonly<ReadingSettings> = READING_SETTINGS): string {
  return JSON.stringify(settings);
}
