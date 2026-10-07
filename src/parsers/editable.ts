import { parseItalianNumber } from '../domain/numbers';
import type { Comparator, Measurement } from '../domain/types';
import { normalizeUnit } from '../domain/units';
import type { LatestReference, MeasurementInput } from '../storage/types';
import { REVIEW_THRESHOLD } from './draft';
import type { BBox, DraftRow, RowFlag } from './types';

/** One row of the verification screen: everything is text the user can edit. */
export interface EditableRow {
  key: string;
  /** Name as printed, or as typed for a manual row. */
  name: string;
  analyteId: string | null;
  customAnalyteId: string | null;
  /** "forse: X" proposal. Never applied without the user's tap. */
  suggestionId: string | null;
  valueText: string;
  unit: string;
  refMinText: string;
  refMaxText: string;
  refText: string;
  section: string | null;
  confidence: number;
  flags: RowFlag[];
  /** The user looked at a doubtful row and accepted it. */
  confirmed: boolean;
  /** Where the row sits on the original page, for "Vedi originale". Null for manual rows. */
  origin: { page: number; bbox: BBox; rawValue: string; initialValueText: string } | null;
  /** Unit/range copied from the analyte's most recent report, until the user edits them. */
  suggestedReference: { sampleDate: string } | null;
  /** The stored measurement this row came from, so an edit keeps its id. Null for a new row. */
  measurementId: string | null;
}

export type RowProblem = 'no-analyte' | 'no-value' | 'bad-ref-min' | 'bad-ref-max' | 'ref-order';

const ANALYTE_FLAGS: RowFlag[] = ['unknown-analyte', 'suggested-analyte', 'ambiguous-analyte'];

/** Numbers are shown the Italian way, without thousands separators: 4220000 and 1,029. */
export function formatNumber(value: number): string {
  return String(value).replace('.', ',');
}

/** In an edit field a single comma or dot is the decimal separator; grouping is not accepted. */
export function parseUserNumber(text: string): number | null {
  const t = text.trim();
  if (!/^\d+([.,]\d+)?$/.test(t)) return null;
  return Number(t.replace(',', '.'));
}

export function toEditableRow(draft: DraftRow, key: string): EditableRow {
  const { parsed } = draft;
  const valueText =
    parsed.value === null
      ? parsed.valueText
      : `${parsed.comparator ?? ''}${formatNumber(parsed.value)}`;
  return {
    key,
    name: draft.rawName,
    analyteId: draft.analyteMatch.analyteId,
    customAnalyteId: null,
    suggestionId: draft.analyteMatch.suggestionId,
    valueText,
    unit: parsed.unit ?? '',
    refMinText: parsed.refMin === null ? '' : formatNumber(parsed.refMin),
    refMaxText: parsed.refMax === null ? '' : formatNumber(parsed.refMax),
    refText: parsed.refText ?? '',
    section: draft.section,
    confidence: draft.confidence,
    flags: [...draft.flags],
    confirmed: false,
    origin: {
      page: draft.page,
      bbox: draft.bbox,
      rawValue: draft.rawValue,
      initialValueText: valueText,
    },
    suggestedReference: null,
    measurementId: null,
  };
}

/** A blank row for manual entry: full confidence, because the user types every field. */
export function emptyEditableRow(key: string): EditableRow {
  return {
    key,
    name: '',
    analyteId: null,
    customAnalyteId: null,
    suggestionId: null,
    valueText: '',
    unit: '',
    refMinText: '',
    refMaxText: '',
    refText: '',
    section: null,
    confidence: 1,
    flags: [],
    confirmed: false,
    origin: null,
    suggestedReference: null,
    measurementId: null,
  };
}

/** A row built from a measurement already in storage: fully resolved, nothing to flag. */
export function measurementToEditableRow(measurement: Measurement, key: string): EditableRow {
  const valueText =
    measurement.value === null
      ? measurement.valueText
      : `${measurement.comparator ?? ''}${formatNumber(measurement.value)}`;
  return {
    key,
    name: '',
    analyteId: measurement.analyteId,
    customAnalyteId: measurement.customAnalyteId,
    suggestionId: null,
    valueText,
    unit: measurement.unit ?? '',
    refMinText: measurement.refMin === null ? '' : formatNumber(measurement.refMin),
    refMaxText: measurement.refMax === null ? '' : formatNumber(measurement.refMax),
    refText: measurement.refText ?? '',
    section: measurement.section,
    confidence: 1,
    flags: [],
    confirmed: true,
    origin: null,
    suggestedReference: null,
    measurementId: measurement.id,
  };
}

/** Choosing the analyte answers every analyte doubt of the row. */
export function withAnalyte(
  row: EditableRow,
  choice: { analyteId: string } | { customAnalyteId: string },
): EditableRow {
  return {
    ...row,
    analyteId: 'analyteId' in choice ? choice.analyteId : null,
    customAnalyteId: 'customAnalyteId' in choice ? choice.customAnalyteId : null,
    suggestionId: null,
    suggestedReference: null,
    flags: row.flags.filter((flag) => !ANALYTE_FLAGS.includes(flag)),
    confidence: Math.max(row.confidence, REVIEW_THRESHOLD),
  };
}

/** Fills a blank row's unit and range from its analyte's most recent report. */
export function withSuggestedReference(row: EditableRow, latest: LatestReference): EditableRow {
  const hasReference =
    latest.unit !== null ||
    latest.refMin !== null ||
    latest.refMax !== null ||
    latest.refText !== null;
  return {
    ...row,
    unit: latest.unit ?? '',
    refMinText: latest.refMin === null ? '' : formatNumber(latest.refMin),
    refMaxText: latest.refMax === null ? '' : formatNumber(latest.refMax),
    refText: latest.refText ?? '',
    suggestedReference: hasReference ? { sampleDate: latest.sampleDate } : null,
  };
}

/**
 * The two ways the printed value can be read when the row carries the ambiguous-number flag:
 * decimal first ("1,029"), then thousands ("1029"). Null when there is nothing to choose between.
 */
export function ambiguousReadings(row: EditableRow): [string, string] | null {
  if (!row.flags.includes('ambiguous-number') || !row.origin) return null;
  const raw = row.origin.rawValue.trim();
  const match = /^(<=|>=|<|>)?\s*(.+)$/.exec(raw);
  if (!match) return null;
  const prefix = match[1] ?? '';
  const numberPart = match[2] ?? '';
  const decimal = parseItalianNumber(numberPart, 'decimal');
  const thousands = parseItalianNumber(numberPart, 'thousands');
  if (decimal === null || thousands === null || decimal === thousands) return null;
  return [`${prefix}${formatNumber(decimal)}`, `${prefix}${formatNumber(thousands)}`];
}

/** Applies a reading the user picked from ambiguousReadings: settles the value, resolves that doubt. */
export function withReading(row: EditableRow, text: string): EditableRow {
  return {
    ...row,
    valueText: text,
    flags: row.flags.filter((flag) => flag !== 'ambiguous-number'),
  };
}

export function isPending(row: EditableRow): boolean {
  return !row.confirmed && (row.flags.length > 0 || row.confidence < REVIEW_THRESHOLD);
}

function optionalNumber(text: string): number | null | 'invalid' {
  if (text.trim() === '') return null;
  return parseUserNumber(text) ?? 'invalid';
}

/** What stops this row from being saved. An empty list means it can be stored. */
export function rowProblems(row: EditableRow): RowProblem[] {
  const problems: RowProblem[] = [];
  if (row.analyteId === null && row.customAnalyteId === null) problems.push('no-analyte');
  if (row.valueText.trim() === '') problems.push('no-value');
  const min = optionalNumber(row.refMinText);
  const max = optionalNumber(row.refMaxText);
  if (min === 'invalid') problems.push('bad-ref-min');
  if (max === 'invalid') problems.push('bad-ref-max');
  if (typeof min === 'number' && typeof max === 'number' && min > max) problems.push('ref-order');
  return problems;
}

function readValue(text: string): { value: number | null; comparator: Comparator | null } {
  const match = /^(<=|>=|<|>)?\s*(\d+(?:[.,]\d+)?)$/.exec(text.trim());
  const value = match?.[2] === undefined ? null : parseUserNumber(match[2]);
  if (value === null) return { value: null, comparator: null };
  return { value, comparator: (match?.[1] as Comparator | undefined) ?? null };
}

/** Call only when rowProblems(row) is empty. */
export function editableToMeasurementInput(row: EditableRow): MeasurementInput {
  const problems = rowProblems(row);
  if (problems.length > 0)
    throw new Error(`Row "${row.name}" cannot be saved: ${problems.join(', ')}`);
  const typed = row.valueText.trim();
  const untouched = row.origin !== null && typed === row.origin.initialValueText;
  const min = optionalNumber(row.refMinText);
  const max = optionalNumber(row.refMaxText);
  return {
    id: row.measurementId ?? undefined,
    analyteId: row.analyteId,
    customAnalyteId: row.customAnalyteId,
    ...readValue(typed),
    // Keep the text exactly as printed unless the user changed it.
    valueText: untouched && row.origin ? row.origin.rawValue.trim() : typed,
    unit: row.unit.trim() === '' ? null : normalizeUnit(row.unit),
    refMin: typeof min === 'number' ? min : null,
    refMax: typeof max === 'number' ? max : null,
    refText: row.refText.trim() === '' ? null : row.refText.trim(),
    confidence: row.confirmed ? 1 : row.confidence,
    section: row.section,
  };
}
