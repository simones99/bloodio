import { getAnalyte } from '../domain/catalog';
import { toCanonicalFactor } from '../domain/units';
import type { BBox, DraftRow } from './types';

/** When an OCR row may skip review (spec 2026-10-16 §6), and what it was measured with. */
export interface OcrTrust {
  /** Lowest word confidence in the row's box, 0..1. */
  threshold: number;
  /**
   * At measurement time: ocrHash() of scripts/ocr-assets.mjs, PREPROCESS_STEPS.join('+') and
   * readingFingerprint() of src/ocr/reading-fingerprint.ts.
   */
  measuredWith: { ocrHash: string; preprocess: string; reading: string };
}

/**
 * Off: every OCR row is reviewed. Turned on in its own commit only when photographed reports meet
 * spec 2026-10-16 §6.3, with the measured totals written in the spec.
 */
export const OCR_TRUST: OcrTrust | null = null;

/**
 * Whether the trust rule at `threshold` lets an OCR row skip review: conditions 2-6 hold and the
 * row's confidence is measured and at least the threshold. Fails closed on a missing, null or NaN
 * confidence. Source of truth: scripts/measure-ocr.mjs keeps a copy it cannot import.
 */
export function passesTrust(
  ocr: { confidence: number | null; trustable: boolean } | undefined,
  threshold: number,
): boolean {
  return (
    ocr !== undefined && ocr.trustable && ocr.confidence !== null && ocr.confidence >= threshold
  );
}

/**
 * An optional comparator, then digits with at most one decimal comma. No dot: beyond spec
 * 2026-10-16 §6.2, recorded in Task 17. A dot read by OCR may be a misread comma, which nothing
 * else in the row reveals (spec 2026-10-21 §6), so a dotted value always stays in review.
 */
const CLEAN_VALUE = /^(<=|>=|<|>)?\s*\d+(,\d+)?$/;

/**
 * Conditions 2–6 of §6.2 on a row before the OCR cap: no flag, confident apart from OCR, a clean
 * value inside the entry's reportable range, a reference range with at least one bound, in order.
 * Every check is written so that missing or non-finite data fails it.
 */
export function trustableApartFromOcr(row: DraftRow, minConfidence: number): boolean {
  if (row.flags.length > 0 || !(row.confidence >= minConfidence)) return false;
  if (!CLEAN_VALUE.test(row.rawValue.trim())) return false;
  const analyte = row.analyteMatch.analyteId ? getAnalyte(row.analyteMatch.analyteId) : undefined;
  const range = analyte?.reportable;
  if (!analyte || !range || row.parsed.value === null) return false;
  // A missing unit gives no factor for an entry that has a canonical unit: no guessing the scale.
  const factor = toCanonicalFactor(analyte, row.parsed.unit);
  if (factor === null) return false;
  const canonical = row.parsed.value * factor;
  if (!Number.isFinite(canonical) || !(canonical >= range.min && canonical <= range.max)) {
    return false;
  }
  const { refMin, refMax } = row.parsed;
  const bounds = [refMin, refMax].filter((b): b is number => b !== null);
  if (bounds.length === 0 || !bounds.every(Number.isFinite)) return false;
  if (refMin !== null && refMax !== null && !(refMin < refMax)) return false;
  return true;
}

const isBox = (b: BBox) => [b.x, b.y, b.w, b.h].every(Number.isFinite) && b.w > 0 && b.h > 0;

/**
 * For each row, whether its box overlaps another row's box on the same page with a positive area.
 * Such a row may hold a neighbour's words (a value, unit or reference picked from the line above or
 * below), so it is never trusted: a condition beyond spec 2026-10-16 §6.2, recorded in Task 17. A
 * box that is not a finite rectangle of positive size cannot be checked and counts as overlapping.
 */
export function overlappingRows(rows: readonly { page: number; bbox: BBox }[]): boolean[] {
  return rows.map(({ page, bbox: a }, i) => {
    if (!isBox(a)) return true;
    return rows.some(({ page: otherPage, bbox: b }, j) => {
      if (j === i || otherPage !== page) return false;
      if (!isBox(b)) return true;
      const across = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
      const down = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
      return across > 0 && down > 0;
    });
  });
}

/**
 * False once the models, the pre-processing or the reading settings differ from those the threshold
 * was measured with. Changes to the adapters' layout rules escape it (see READING_SETTINGS).
 */
export function isTrustCurrent(trust: OcrTrust | null, current: OcrTrust['measuredWith']): boolean {
  if (trust === null) return true;
  return (
    trust.measuredWith.ocrHash === current.ocrHash &&
    trust.measuredWith.preprocess === current.preprocess &&
    trust.measuredWith.reading === current.reading
  );
}
