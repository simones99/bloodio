import { getAnalyte } from '../domain/catalog';
import { matchAnalyte, specimenOfSection } from '../domain/matching';
import { chooseDotMode, parseValue } from '../domain/numbers';
import { parseReference } from '../domain/reference';
import { inferReportType } from '../domain/report-type';
import type { Specimen } from '../domain/types';
import {
  isKnownUnit,
  normalizeUnit,
  repairOcrUnit,
  toCanonicalFactor,
  unitsOf,
} from '../domain/units';
import { rowOcrConfidence } from '../ocr/row-confidence';
import {
  OCR_TRUST,
  overlappingRows,
  passesTrust,
  trustableApartFromOcr,
  type OcrTrust,
} from './ocr-trust';
import type {
  DraftReport,
  DraftRow,
  PositionedPage,
  PositionedText,
  RawRow,
  RowFlag,
} from './types';

/** Rows below this confidence, or with any flag, are highlighted in the verification screen. */
export const REVIEW_THRESHOLD = 0.8;

export function needsReview(row: DraftRow): boolean {
  return row.confidence < REVIEW_THRESHOLD || row.flags.length > 0;
}

/**
 * Every row read by OCR is checked by the user: OCR misreads digits silently, even with high
 * confidence. Capping just below the review threshold puts each one in "da controllare".
 */
export const OCR_MAX_CONFIDENCE = 0.79;

function asOcrRow(row: DraftRow): DraftRow {
  return {
    ...row,
    confidence: Math.min(row.confidence, OCR_MAX_CONFIDENCE),
    flags: [...row.flags, 'low-ocr'],
  };
}

export interface DraftOptions {
  /** Upper bound for every row's confidence (the generic adapter caps at 0.5). */
  maxConfidence?: number;
  /** The row was read by OCR: a mangled unit may be repaired by shape (spec 2026-10-16 §5). */
  ocr?: boolean;
}

export function buildDraftRow(raw: RawRow, options: DraftOptions = {}): DraftRow {
  const flags: RowFlag[] = [];
  let unit = raw.unit.trim() === '' ? null : normalizeUnit(raw.unit);

  const match = matchAnalyte(raw.name, { unit, section: raw.section });
  if (match.status === 'none') flags.push('unknown-analyte');
  if (match.status === 'suggested') flags.push('suggested-analyte');
  if (match.ambiguous) flags.push('ambiguous-analyte');
  const analyte = match.analyteId ? getAnalyte(match.analyteId) : undefined;

  let factor = analyte ? toCanonicalFactor(analyte, unit) : null;
  // The five conditions of spec §5.2 are listed here on purpose, even though repairOcrUnit
  // re-checks the spelling itself. The last one: only a spelling no lab prints ("pmol/l" is a
  // real unit, never read as µmol/L). The repair runs before chooseDotMode (spec §5.3).
  if (
    options.ocr &&
    analyte?.kind === 'numeric' &&
    !match.ambiguous &&
    unit !== null &&
    factor === null &&
    !isKnownUnit(raw.unit)
  ) {
    const repaired = repairOcrUnit(raw.unit, unitsOf(analyte));
    if (repaired !== null) {
      unit = repaired;
      factor = toCanonicalFactor(analyte, unit);
      flags.push('ocr-unit');
    }
  }
  if (analyte?.kind === 'numeric' && unit !== null && factor === null) flags.push('unit-mismatch');

  const dots = chooseDotMode([raw.value, raw.ref], analyte?.plausible, factor ?? 1);
  if (dots.ambiguous) flags.push('ambiguous-number');

  const value = parseValue(raw.value, dots.mode);
  const reference = parseReference(raw.ref, dots.mode);
  if (reference.ageStratified) flags.push('age-stratified-ref');
  if (reference.derived) flags.push('derived-ref');

  const expectsNumber = analyte?.kind === 'numeric';
  const valueScore = value.valueText === '' ? 0 : expectsNumber && value.value === null ? 0.5 : 1;
  const hasBounds = reference.refMin !== null || reference.refMax !== null;
  const referenceScore = expectsNumber && reference.refText !== null && !hasBounds ? 0.7 : 1;
  const matchScore = match.status === 'none' ? 0 : match.score;
  const confidence = Math.min(matchScore, valueScore, referenceScore, options.maxConfidence ?? 1);

  return {
    rawName: raw.name,
    rawValue: raw.value,
    rawUnit: raw.unit,
    rawRef: raw.ref,
    section: raw.section,
    page: raw.page,
    bbox: raw.bbox,
    ...(raw.valueBox && { valueBox: raw.valueBox }),
    analyteMatch: {
      analyteId: match.analyteId,
      suggestionId: match.suggestionId,
      score: match.score,
    },
    parsed: {
      value: value.value,
      comparator: value.comparator,
      valueText: value.valueText,
      unit,
      refMin: reference.refMin,
      refMax: reference.refMax,
      refText: reference.refText,
    },
    confidence,
    flags,
  };
}

function specimenOfRow(row: DraftRow): Specimen | null {
  const analyte = row.analyteMatch.analyteId ? getAnalyte(row.analyteMatch.analyteId) : undefined;
  if (analyte) return analyte.specimen;
  return row.section ? specimenOfSection(row.section) : null;
}

export interface DraftReportInput {
  adapterId: string;
  lab: string | null;
  sampleDate: string | null;
  rawRows: RawRow[];
  source: PositionedText['source'];
  options?: DraftOptions;
  /** The pages the rows were read from: OCR rows take their word confidence from them. */
  pages?: PositionedPage[];
  /** The OCR trust rule; OCR_TRUST when absent. Tests pass their own. */
  trust?: OcrTrust | null;
}

export function buildDraftReport(input: DraftReportInput): DraftReport {
  // Only an absent rule defaults to OCR_TRUST: an explicit null keeps it off.
  const { trust = OCR_TRUST } = input;
  const overlapping = input.source === 'ocr' ? overlappingRows(input.rawRows) : [];
  const rows = input.rawRows.map((raw, i) => {
    const row = buildDraftRow(raw, { ...input.options, ocr: input.source === 'ocr' });
    if (input.source !== 'ocr') return row;
    const confidence = rowOcrConfidence(raw.bbox, input.pages?.[raw.page]);
    // Overlap and alignment: beyond spec 2026-10-16 §6.2, recorded in Task 17.
    const trustable =
      trustableApartFromOcr(row, REVIEW_THRESHOLD) &&
      overlapping[i] === false &&
      raw.aligned === true;
    const withOcr: DraftRow = { ...row, ocr: { confidence, trustable } };
    // Spec 2026-10-16 §6.2: only with the rule on, conditions 2-6 (and no overlap) holding and
    // condition 1 measured.
    const trusted = trust !== null && passesTrust(withOcr.ocr, trust.threshold);
    return trusted ? withOcr : asOcrRow(withOcr);
  });
  const warnings: string[] = [];
  if (rows.length === 0) warnings.push('no-rows');
  if (input.sampleDate === null) warnings.push('no-date');
  if (rows.some((r) => r.rawValue === '')) warnings.push('empty-value-rows');
  return {
    adapterId: input.adapterId,
    lab: input.lab,
    sampleDate: input.sampleDate,
    type: inferReportType(rows.map(specimenOfRow)),
    rows,
    warnings,
  };
}
