// Compares an OCR reading with the report it was drawn or photographed from (spec 2026-10-16 §3.3).
import { normalizeName } from '../../src/domain/normalize';
import { normalizeUnit } from '../../src/domain/units';
import { passesTrust } from '../../src/parsers/ocr-trust';
import type { DraftReport, DraftRow, RowFlag } from '../../src/parsers/types';

export type Outcome =
  | 'mancante'
  | 'voce sbagliata'
  | 'valore sbagliato'
  | 'unità sbagliata'
  | 'range sbagliato'
  | 'giusta';

export interface RowResult {
  /** The row's name in the truth. */
  name: string;
  outcome: Outcome;
  expectedUnit: string | null;
  /** The unit as the OCR read it; null when the row is missing, '' when the unit was not read. */
  readUnit: string | null;
  unitRepaired: boolean;
  ocrConfidence: number | null;
  trustable: boolean;
  /** The flags of the row read; empty when the row is missing. */
  flags: RowFlag[];
}

/** A row read that matches no row of the truth: still a row the user could skip reviewing. */
export interface ExtraRow {
  analyteId: string | null;
  page: number;
  rawName: string;
  rawValue: string;
  rawUnit: string;
  ocrConfidence: number | null;
  trustable: boolean;
  flags: RowFlag[];
}

export interface Comparison {
  rows: RowResult[];
  /** Rows read that match no row of the truth. */
  extra: ExtraRow[];
}

/**
 * Whether the trust rule at `threshold` would let this row skip review (spec 2026-10-16 §6.2).
 * Works on matched rows and extra rows alike; §6.3 counts a trusted row that is not "giusta", and
 * every trusted extra row, as an error.
 */
export const isTrustedAt = (
  row: { ocrConfidence: number | null; trustable: boolean },
  threshold: number,
): boolean => passesTrust({ confidence: row.ocrConfidence, trustable: row.trustable }, threshold);

const sameNumber = (a: number | null, b: number | null) =>
  a === null || b === null ? a === b : Math.abs(a - b) < 1e-9;

const sameText = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();
const unitKey = (unit: string | null) => (unit === null ? null : normalizeUnit(unit));

function outcomeOf(expected: DraftRow, found: DraftRow | null): Outcome {
  if (!found) return 'mancante';
  if (found.analyteMatch.analyteId !== expected.analyteMatch.analyteId) return 'voce sbagliata';
  const textual = found.parsed.value === null || expected.parsed.value === null;
  if (
    !sameNumber(found.parsed.value, expected.parsed.value) ||
    found.parsed.comparator !== expected.parsed.comparator ||
    (textual && !sameText(found.parsed.valueText, expected.parsed.valueText))
  ) {
    return 'valore sbagliato';
  }
  if (unitKey(found.parsed.unit) !== unitKey(expected.parsed.unit)) return 'unità sbagliata';
  if (
    !sameNumber(found.parsed.refMin, expected.parsed.refMin) ||
    !sameNumber(found.parsed.refMax, expected.parsed.refMax)
  ) {
    return 'range sbagliato';
  }
  return 'giusta';
}

/**
 * Each row of the truth meets at most one row read: by entry when both recognised it, otherwise by
 * normalized name; the same page is tried before other pages. The first outcome that applies wins,
 * in the order of Outcome. Rows read and not met are returned as `extra`.
 */
export function compareReports(truth: DraftReport, read: DraftReport): Comparison {
  const unused = new Set(read.rows.keys());
  const take = (fits: (row: DraftRow) => boolean): DraftRow | null => {
    for (const index of unused) {
      const row = read.rows[index]!;
      if (fits(row)) {
        unused.delete(index);
        return row;
      }
    }
    return null;
  };
  const matcher = (expected: DraftRow) => {
    const id = expected.analyteMatch.analyteId;
    const name = normalizeName(expected.rawName);
    return {
      samePage: (row: DraftRow) => row.page === expected.page,
      sameId: (row: DraftRow) => id !== null && row.analyteMatch.analyteId === id,
      sameName: (row: DraftRow) => normalizeName(row.rawName) === name,
    };
  };
  // Two passes, so that a row missed on its own page never takes the row read on another page.
  // Within a pass: by entry before by name, and the same name first within an entry.
  const found: (DraftRow | null)[] = truth.rows.map(() => null);
  truth.rows.forEach((expected, i) => {
    const { samePage, sameId, sameName } = matcher(expected);
    found[i] =
      take((row) => samePage(row) && sameId(row) && sameName(row)) ??
      take((row) => samePage(row) && sameId(row)) ??
      take((row) => samePage(row) && sameName(row));
  });
  truth.rows.forEach((expected, i) => {
    if (found[i]) return;
    const { sameId, sameName } = matcher(expected);
    found[i] = take((row) => sameId(row) && sameName(row)) ?? take(sameId) ?? take(sameName);
  });
  const rows = truth.rows.map((expected, i): RowResult => {
    const row = found[i] ?? null;
    return {
      name: expected.rawName,
      outcome: outcomeOf(expected, row),
      expectedUnit: expected.parsed.unit,
      readUnit: row ? row.rawUnit : null,
      unitRepaired: row?.flags.includes('ocr-unit') ?? false,
      ocrConfidence: row?.ocr?.confidence ?? null,
      trustable: row?.ocr?.trustable ?? false,
      flags: row?.flags ?? [],
    };
  });
  const extra = [...unused].map((index): ExtraRow => {
    const row = read.rows[index]!;
    return {
      analyteId: row.analyteMatch.analyteId,
      page: row.page,
      rawName: row.rawName,
      rawValue: row.rawValue,
      rawUnit: row.rawUnit,
      ocrConfidence: row.ocr?.confidence ?? null,
      trustable: row.ocr?.trustable ?? false,
      flags: row.flags,
    };
  });
  return { rows, extra };
}

/** A row the lab adapter cut from the reading, as AlignmentRow in main.ts gives it. */
export interface CutRow {
  page: number;
  name: string;
  value: string;
}

/**
 * The outcome of each row the adapter cut from a reading: that of the truth row with the same
 * page, name and value text, or null when no truth row has them (a value read wrong lands here).
 * Each truth row answers at most once. `rows` is compareReports(truth, …).rows, in truth order.
 */
export function cutRowOutcomes(
  truth: DraftReport,
  rows: readonly RowResult[],
  cut: readonly CutRow[],
): (Outcome | null)[] {
  const unused = new Set(truth.rows.keys());
  return cut.map((row) => {
    const name = normalizeName(row.name);
    for (const index of unused) {
      const expected = truth.rows[index]!;
      if (
        expected.page === row.page &&
        normalizeName(expected.rawName) === name &&
        expected.rawValue.trim() === row.value.trim()
      ) {
        unused.delete(index);
        return rows[index]?.outcome ?? null;
      }
    }
    return null;
  });
}
