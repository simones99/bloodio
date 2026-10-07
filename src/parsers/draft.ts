import { getAnalyte } from '../domain/catalog';
import { matchAnalyte, specimenOfSection } from '../domain/matching';
import { chooseDotMode, parseValue } from '../domain/numbers';
import { parseReference } from '../domain/reference';
import { inferReportType } from '../domain/report-type';
import type { Specimen } from '../domain/types';
import { normalizeUnit, toCanonicalFactor } from '../domain/units';
import type { DraftReport, DraftRow, PositionedText, RawRow, RowFlag } from './types';

/** Rows below this confidence, or with any flag, are highlighted in the verification screen. */
export const REVIEW_THRESHOLD = 0.8;

export function needsReview(row: DraftRow): boolean {
  return row.confidence < REVIEW_THRESHOLD || row.flags.length > 0;
}

export interface DraftOptions {
  /** Upper bound for every row's confidence (the generic adapter caps at 0.5). */
  maxConfidence?: number;
  /** Mean OCR word confidence of the row, 0..1. Defaults to 1 for PDF text. */
  ocrConfidence?: number;
}

export function buildDraftRow(raw: RawRow, options: DraftOptions = {}): DraftRow {
  const flags: RowFlag[] = [];
  const unit = raw.unit.trim() === '' ? null : normalizeUnit(raw.unit);

  const match = matchAnalyte(raw.name, { unit, section: raw.section });
  if (match.status === 'none') flags.push('unknown-analyte');
  if (match.status === 'suggested') flags.push('suggested-analyte');
  if (match.ambiguous) flags.push('ambiguous-analyte');
  const analyte = match.analyteId ? getAnalyte(match.analyteId) : undefined;

  const factor = analyte ? toCanonicalFactor(analyte, unit) : null;
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
  const confidence = Math.min(
    matchScore,
    valueScore,
    referenceScore,
    options.ocrConfidence ?? 1,
    options.maxConfidence ?? 1,
  );
  if ((options.ocrConfidence ?? 1) < REVIEW_THRESHOLD) flags.push('low-ocr');

  return {
    rawName: raw.name,
    rawValue: raw.value,
    rawUnit: raw.unit,
    rawRef: raw.ref,
    section: raw.section,
    page: raw.page,
    bbox: raw.bbox,
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
}

export function buildDraftReport(input: DraftReportInput): DraftReport {
  const rows = input.rawRows.map((raw) => buildDraftRow(raw, input.options));
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
