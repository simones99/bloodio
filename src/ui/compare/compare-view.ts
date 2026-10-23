import { getAnalyte } from '../../domain/catalog';
import { displayUnit } from '../../domain/series';
import {
  analyteRefOf,
  analyteRefToString,
  type AnalyteRef,
  type Category,
  type CustomAnalyte,
  type Measurement,
  type Report,
  type UnitSystem,
} from '../../domain/types';
import type { ReportWithMeasurements } from '../../storage/types';
import { analytePath, formatRowRange, rowInUnit, type HistoryRow } from '../analyte/analyte-view';
import { it } from '../i18n/it';

const CATEGORY_ORDER = Object.keys(it.category) as Category[];

/** numeric: two numbers in one unit; units: two numbers that cannot share one; single: one report only. */
export type ComparisonKind = 'numeric' | 'qualitative' | 'units' | 'single';
export type Transition = 'now-above' | 'now-below' | 'now-out' | 'now-in';

export interface Delta {
  /** Recent minus older, in the common unit. */
  absolute: number;
  /** Relative to the older value; null when the older value is 0. */
  percent: number | null;
  /** Decimals of the more precise printed value; null when a value was converted. */
  decimals: number | null;
}

export interface ComparisonRow {
  /** Unique in the view: the entry key and the position among rows of the same entry. */
  key: string;
  name: string;
  category: Category;
  path: string;
  kind: ComparisonKind;
  older: HistoryRow | null;
  newer: HistoryRow | null;
  delta: Delta | null;
  /** Which value carries a comparator ("<9"), so the two are not subtracted. */
  limit: 'older' | 'newer' | 'both' | null;
  /** From the stored outOfRange of each report, each against the range it printed. */
  transition: Transition | null;
  rangeChanged: { from: string; to: string } | null;
}

export interface ComparisonView {
  /** Rows whose value went into or out of its printed range, in the order of the groups. */
  changed: ComparisonRow[];
  /** Every other row, by category. */
  groups: { category: Category; rows: ComparisonRow[] }[];
  /** Rows measured in both reports. */
  common: number;
  /** Rows measured in only one of the two. */
  single: number;
}

export interface ComparisonInput {
  older: ReportWithMeasurements;
  newer: ReportWithMeasurements;
  custom: CustomAnalyte[];
  preferred: Record<string, string>;
  system: UnitSystem;
}

export function comparePath(a: string, b: string): string {
  return `/compare?a=${encodeURIComponent(a)}&b=${encodeURIComponent(b)}`;
}

interface Entry {
  ref: AnalyteRef;
  key: string;
  /** Position among the measurements of the same entry in this report. */
  index: number;
  measurement: Measurement;
}

/** Measurements in report order with their entry key. Rows never assigned to an entry are left out. */
function entries(measurements: Measurement[]): Entry[] {
  const seen = new Map<string, number>();
  return [...measurements]
    .sort((a, b) => a.order - b.order)
    .flatMap((measurement) => {
      const ref = analyteRefOf(measurement);
      if (!ref) return [];
      const key = analyteRefToString(ref);
      const index = seen.get(key) ?? 0;
      seen.set(key, index + 1);
      return [{ ref, key, index, measurement }];
    });
}

const find = (list: Entry[], key: string, index: number) =>
  list.find((e) => e.key === key && e.index === index)?.measurement ?? null;

const pointOf = (measurement: Measurement, report: Report) => ({
  measurement,
  reportId: report.id,
  sampleDate: report.sampleDate,
  lab: report.lab,
});

/** Decimals as printed: "5,07" and "5.07" have 2, "1.029" has 3, "4.220.000" (thousands) has 0. */
function decimalsOf(row: HistoryRow): number {
  const token = /\d[\d.,]*/.exec(row.valueText)?.[0] ?? '';
  const comma = token.lastIndexOf(',');
  if (comma >= 0) return token.length - comma - 1;
  const dot = token.lastIndexOf('.');
  // A dot is a thousands separator when dropping it gives back the stored value.
  return dot >= 0 && Number(token.replace(/\./g, '')) !== row.value ? token.length - dot - 1 : 0;
}

function deltaOf(older: HistoryRow, newer: HistoryRow): Delta | null {
  if (older.value === null || newer.value === null) return null;
  if (older.comparator || newer.comparator) return null;
  const absolute = newer.value - older.value;
  return {
    absolute,
    percent: older.value === 0 ? null : (absolute / Math.abs(older.value)) * 100,
    decimals: older.exact && newer.exact ? Math.max(decimalsOf(older), decimalsOf(newer)) : null,
  };
}

function limitOf(older: HistoryRow, newer: HistoryRow): ComparisonRow['limit'] {
  if (older.comparator && newer.comparator) return 'both';
  if (older.comparator) return 'older';
  if (newer.comparator) return 'newer';
  return null;
}

function transitionOf(older: HistoryRow, newer: HistoryRow): Transition | null {
  if (older.outOfRange === null || newer.outOfRange === null) return null;
  if (older.outOfRange === newer.outOfRange) return null;
  if (!newer.outOfRange) return 'now-in';
  const { value, refMin, refMax } = newer;
  if (value !== null && refMax !== null && value > refMax) return 'now-above';
  if (value !== null && refMin !== null && value < refMin) return 'now-below';
  return 'now-out';
}

const near = (a: number | null, b: number | null) =>
  a === null || b === null
    ? a === b
    : Math.abs(a - b) <= 1e-9 * Math.max(Math.abs(a), Math.abs(b), 1);

function rangeChangeOf(older: HistoryRow, newer: HistoryRow): ComparisonRow['rangeChanged'] {
  const numeric = [older.refMin, older.refMax, newer.refMin, newer.refMax].some((x) => x !== null);
  const same = numeric
    ? near(older.refMin, newer.refMin) && near(older.refMax, newer.refMax)
    : (older.refText ?? '') === (newer.refText ?? '');
  if (same) return null;
  return {
    from: formatRowRange(older) ?? it.compare.noRange,
    to: formatRowRange(newer) ?? it.compare.noRange,
  };
}

/** `entry` is the recent measurement when there is one, else the older one. */
function toComparisonRow(
  entry: Entry,
  older: Measurement | null,
  newer: Measurement | null,
  input: ComparisonInput,
): ComparisonRow {
  const { ref, key, index } = entry;
  const analyte = ref.kind === 'catalog' ? getAnalyte(ref.id) : undefined;
  const own = ref.kind === 'custom' ? input.custom.find((c) => c.id === ref.id) : undefined;
  // The recent report decides the unit; the older value follows it when it can.
  const unit = displayUnit(analyte, entry.measurement.unit, {
    preferred: input.preferred[key],
    system: input.system,
  });
  const olderRow = older && rowInUnit(pointOf(older, input.older.report), analyte, unit);
  const newerRow = newer && rowInUnit(pointOf(newer, input.newer.report), analyte, unit);
  const base = {
    key: `${key}#${index}`,
    name: analyte?.name ?? own?.name ?? '—',
    category: analyte?.category ?? own?.category ?? 'altro',
    path: analytePath(ref),
    older: olderRow,
    newer: newerRow,
    delta: null,
    limit: null,
    transition: null,
    rangeChanged: null,
  };
  if (!olderRow || !newerRow) return { ...base, kind: 'single' };
  const transition = transitionOf(olderRow, newerRow);
  if (olderRow.value === null || newerRow.value === null) {
    return {
      ...base,
      kind: 'qualitative',
      transition,
      rangeChanged: rangeChangeOf(olderRow, newerRow),
    };
  }
  if (!olderRow.converted || !newerRow.converted) return { ...base, kind: 'units', transition };
  return {
    ...base,
    kind: 'numeric',
    delta: deltaOf(olderRow, newerRow),
    limit: limitOf(olderRow, newerRow),
    transition,
    rangeChanged: rangeChangeOf(olderRow, newerRow),
  };
}

/** Everything the comparison page shows (spec 2026-10-14 §3.3). Pure. */
export function buildComparison(input: ComparisonInput): ComparisonView {
  const older = entries(input.older.measurements);
  const newer = entries(input.newer.measurements);
  const rows = [
    ...newer.map((e) => toComparisonRow(e, find(older, e.key, e.index), e.measurement, input)),
    ...older
      .filter((e) => find(newer, e.key, e.index) === null)
      .map((e) => toComparisonRow(e, e.measurement, null, input)),
  ];
  const ordered = CATEGORY_ORDER.flatMap((category) => rows.filter((r) => r.category === category));
  return {
    changed: ordered.filter((r) => r.transition !== null),
    groups: CATEGORY_ORDER.map((category) => ({
      category,
      rows: ordered.filter((r) => r.category === category && r.transition === null),
    })).filter((g) => g.rows.length > 0),
    common: rows.filter((r) => r.kind !== 'single').length,
    single: rows.filter((r) => r.kind === 'single').length,
  };
}
