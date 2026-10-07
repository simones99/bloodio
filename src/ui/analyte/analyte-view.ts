import { getAnalyte } from '../../domain/catalog';
import {
  defaultDisplayUnit,
  toSeries,
  trendPoints,
  type ConvertedPoint,
} from '../../domain/series';
import { watchSide } from '../../domain/trend';
import {
  analyteRefToString,
  type AnalyteRef,
  type Category,
  type Comparator,
  type CustomAnalyte,
  type OutOfRange,
} from '../../domain/types';
import { normalizeUnit, unitsOf } from '../../domain/units';
import type { SeriesPoint } from '../../storage/types';
import type { ChartPoint, PointDetail } from '../chart/chart-model';
import {
  formatConvertedNumber,
  formatDateLong,
  formatDateShort,
  formatDisplayNumber,
  formatMonthLong,
  it,
} from '../i18n/it';

/** One line of the history table, and the header's latest value. */
export interface HistoryRow {
  key: string;
  reportId: string;
  sampleDate: string;
  lab: string;
  value: number | null;
  comparator: Comparator | null;
  valueText: string;
  /** The unit `value` and the range are expressed in. */
  unit: string | null;
  refMin: number | null;
  refMax: number | null;
  refText: string | null;
  outOfRange: OutOfRange;
  /** Expressed in the page's display unit (so it is also on the chart, when numeric). */
  converted: boolean;
  /** Numbers exactly as printed, no unit change: they keep the laboratory's precision. */
  exact: boolean;
}

export interface AnalyteView {
  name: string;
  category: Category;
  unit: string | null;
  /** Units the chips offer; the page hides the chips when there is only one. */
  unitOptions: string[];
  latest: HistoryRow | null;
  /** Newest first. */
  rows: HistoryRow[];
  /** Oldest first, display unit only. */
  chartPoints: ChartPoint[];
  /** Detail box contents for every plotted point, keyed like `chartPoints`. */
  pointDetails: Record<string, PointDetail>;
  /** Numeric values whose printed unit cannot be converted to `unit`. */
  excludedCount: number;
  /** The latest value is close to a printed limit and moving towards it. */
  watch: boolean;
  /** The chart's text alternative; null when there is no chart. */
  summary: string | null;
  /** Subtitle and date of the exported image; null when there is no chart. */
  image: { subtitle: string; date: string } | null;
}

export function analytePath(ref: AnalyteRef): string {
  return `/analytes/${encodeURIComponent(analyteRefToString(ref))}`;
}

const normalized = (unit: string | null) => (unit === null ? null : normalizeUnit(unit));

function toRow(
  point: SeriesPoint,
  converted: ConvertedPoint<SeriesPoint> | undefined,
  unit: string | null,
): HistoryRow {
  const m = point.measurement;
  const base = {
    key: m.id,
    reportId: point.reportId,
    sampleDate: point.sampleDate,
    lab: point.lab,
    comparator: m.comparator,
    valueText: m.valueText,
    refText: m.refText,
    outOfRange: m.outOfRange,
  };
  if (converted) {
    return {
      ...base,
      value: converted.value,
      unit,
      refMin: converted.refMin,
      refMax: converted.refMax,
      converted: true,
      exact: normalized(m.unit) === normalized(unit),
    };
  }
  return {
    ...base,
    value: m.value,
    unit: m.unit,
    refMin: m.refMin,
    refMax: m.refMax,
    converted: false,
    exact: true,
  };
}

const formatFor = (row: HistoryRow, value: number) =>
  row.exact ? formatDisplayNumber(value) : formatConvertedNumber(value);

export function formatRowValue(row: HistoryRow): string {
  if (row.value === null) return row.valueText;
  return `${row.comparator ?? ''}${formatFor(row, row.value)}`;
}

/** "0,27 – 4,2"; one-sided ranges as printed ("Fino a 77,0") when the numbers are the printed ones. */
export function formatRowRange(row: HistoryRow): string | null {
  const { refMin, refMax, refText } = row;
  if (refMin !== null && refMax !== null) {
    return `${formatFor(row, refMin)} – ${formatFor(row, refMax)}`;
  }
  if ((refMin !== null || refMax !== null) && row.exact && refText) {
    return refText.split('\n').join('; ');
  }
  if (refMax !== null) return `< ${formatFor(row, refMax)}`;
  if (refMin !== null) return `> ${formatFor(row, refMin)}`;
  return refText === null ? null : refText.split('\n').join('; ');
}

/** True when the report printed any reference for this value. */
export function hasReference(row: HistoryRow): boolean {
  return row.refText !== null || row.refMin !== null || row.refMax !== null;
}

function above(row: HistoryRow): boolean {
  return (
    row.outOfRange === true && row.value !== null && row.refMax !== null && row.value > row.refMax
  );
}

function below(row: HistoryRow): boolean {
  return (
    row.outOfRange === true && row.value !== null && row.refMin !== null && row.value < row.refMin
  );
}

function rangeState(row: HistoryRow): string | null {
  if (above(row)) return it.analyte.aboveRange;
  if (below(row)) return it.analyte.belowRange;
  if (row.outOfRange === true) return it.analyte.outRange;
  if (row.outOfRange === false) return it.analyte.inRange;
  return null;
}

function pointDetail(row: HistoryRow): PointDetail {
  const value = row.unit ? `${formatRowValue(row)} ${row.unit}` : formatRowValue(row);
  return {
    label: it.analyte.pointLabel({
      date: formatDateShort(row.sampleDate),
      value,
      state: rangeState(row),
    }),
    value,
    date: formatDateLong(row.sampleDate),
    lab: row.lab,
    href: `/reports/${row.reportId}`,
  };
}

/** Everything the analyte page shows, computed from the stored series. Pure. */
export function buildAnalyteView(
  points: SeriesPoint[],
  ref: AnalyteRef,
  custom: CustomAnalyte[],
  preferredUnit?: string,
): AnalyteView {
  const analyte = ref.kind === 'catalog' ? getAnalyte(ref.id) : undefined;
  const own = ref.kind === 'custom' ? custom.find((c) => c.id === ref.id) : undefined;
  const name = analyte?.name ?? own?.name ?? '—';

  // Stable sort: two reports on the same day keep the order the repository gave them.
  const sorted = [...points].sort((a, b) => a.sampleDate.localeCompare(b.sampleDate));
  const latestNumeric = [...sorted].reverse().find((p) => p.measurement.value !== null);
  const unit = defaultDisplayUnit(analyte, latestNumeric?.measurement.unit ?? null, preferredUnit);

  const series = toSeries(sorted, analyte, unit);
  const convertedById = new Map(series.converted.map((c) => [c.source.measurement.id, c]));
  const ascending = sorted.map((p) => toRow(p, convertedById.get(p.measurement.id), unit));
  const latest = ascending[ascending.length - 1] ?? null;

  const known = analyte ? unitsOf(analyte).map(normalizeUnit) : [];
  // Catalog units first, then the printed unit of the latest value (even if not in the catalog,
  // so the user can always go back to it), then the current display unit.
  const printed = latestNumeric?.measurement.unit;
  const unitOptions = [
    ...new Set([
      ...known,
      ...(printed ? [normalizeUnit(printed)] : []),
      ...(unit === null ? [] : [unit]),
    ]),
  ];

  const plotted = ascending.filter((r) => r.converted && r.value !== null);
  const first = plotted[0];
  const last = plotted[plotted.length - 1];
  const summary =
    first && last && plotted.length >= 2
      ? it.analyte.summary({
          name,
          from: formatMonthLong(first.sampleDate),
          to: formatMonthLong(last.sampleDate),
          count: plotted.length,
          above: plotted.filter(above).length,
          below: plotted.filter(below).length,
          first: formatRowValue(first),
          last: formatRowValue(last),
          unit,
        })
      : null;
  const image =
    first && last && plotted.length >= 2
      ? {
          subtitle: [
            unit,
            first.sampleDate.slice(0, 7) === last.sampleDate.slice(0, 7)
              ? formatMonthLong(last.sampleDate)
              : `${formatMonthLong(first.sampleDate)} – ${formatMonthLong(last.sampleDate)}`,
          ]
            .filter(Boolean)
            .join(' · '),
          date: last.sampleDate,
        }
      : null;

  return {
    name,
    category: analyte?.category ?? own?.category ?? 'altro',
    unit,
    unitOptions,
    latest,
    rows: [...ascending].reverse(),
    chartPoints: series.converted.map((c) => ({
      key: c.source.measurement.id,
      date: c.source.sampleDate,
      value: c.value,
      comparator: c.comparator,
      refMin: c.refMin,
      refMax: c.refMax,
      outOfRange: c.source.measurement.outOfRange,
    })),
    pointDetails: Object.fromEntries(plotted.map((row) => [row.key, pointDetail(row)])),
    excludedCount: series.unconvertible.length,
    watch:
      latest?.converted === true &&
      latest.comparator === null &&
      watchSide(trendPoints(series.converted)) !== null,
    summary,
    image,
  };
}
