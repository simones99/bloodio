// The switch-on criterion of spec 2026-10-16 §6.3, computed over one pipeline's rows. Pure: the
// measuring page exposes it to scripts/measure-ocr.mjs, which cannot import TypeScript.
import { isTrustedAt, type Outcome } from './compare';

/** A matched row of the truth, or a row read that matches none ('in più'). */
export interface CriterionRow {
  outcome: Outcome | 'in più';
  ocrConfidence: number | null;
  trustable: boolean;
}

export type CriterionFailure = 'errors' | 'passing' | 'share';

export interface CriterionResult {
  /** The lowest threshold in hundredths that meets every criterion; null when none does. */
  threshold: number | null;
  /** Why none does: errors at every threshold, or too few passing rows at the first error-free one. */
  failures: CriterionFailure[];
  /** The first error-free threshold, with its passing and read rows; null when there is none. */
  atErrorFree: { threshold: number; passing: number; read: number } | null;
}

/** §6.3 on photographed reports: at least this many rows pass, and this share of the rows read. */
export const MIN_PASSING = 300;
export const MIN_SHARE = 0.3;

/**
 * Photographed reports (§6.3, first three points): no passing row is wrong, at least MIN_PASSING
 * rows pass and at least MIN_SHARE of the rows read. Synthetic reports (fourth point): no passing
 * row has a wrong value. A passing extra row counts as an error in both: nothing tells its value is
 * right. Thresholds are tried upwards in steps of 0.01, so the result is the lowest one rounded up
 * to 0.01. Errors, passing rows and share only fall as the threshold rises: the first error-free
 * threshold is the answer, or the counts there say why there is none.
 */
export function lowestThreshold(
  rows: readonly CriterionRow[],
  { synthetic }: { synthetic: boolean },
): CriterionResult {
  const read = rows.filter((r) => r.outcome !== 'mancante');
  const isError = (r: CriterionRow) =>
    synthetic ? r.outcome === 'valore sbagliato' || r.outcome === 'in più' : r.outcome !== 'giusta';
  for (let hundredths = 0; hundredths <= 100; hundredths++) {
    const threshold = hundredths / 100;
    const passing = read.filter((r) => isTrustedAt(r, threshold));
    if (passing.some(isError)) continue;
    const failures: CriterionFailure[] = [];
    if (!synthetic && passing.length < MIN_PASSING) failures.push('passing');
    if (!synthetic && !(passing.length >= MIN_SHARE * read.length)) failures.push('share');
    return {
      threshold: failures.length === 0 ? threshold : null,
      failures,
      atErrorFree: { threshold, passing: passing.length, read: read.length },
    };
  }
  return { threshold: null, failures: ['errors'], atErrorFree: null };
}
