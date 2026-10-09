import type { TrendPoint } from './trend';
import type { Analyte, Comparator, Measurement, UnitSystem } from './types';
import { normalizeUnit, toCanonicalFactor } from './units';

/** A numeric measurement expressed in the unit chosen for display. Value and range share one factor. */
export interface ConvertedPoint<T> {
  source: T;
  value: number;
  comparator: Comparator | null;
  refMin: number | null;
  refMax: number | null;
  unit: string | null;
}

export interface Series<T> {
  /** Numeric points in the target unit, in the order received. */
  converted: ConvertedPoint<T>[];
  /** Numeric points printed in a unit that cannot be converted: shown apart, never mixed in. */
  unconvertible: T[];
  /** Qualitative results ("Assente", "Rare"): listed in tables, never plotted. */
  nonNumeric: T[];
}

function factorBetween(
  analyte: Analyte | undefined,
  from: string | null,
  to: string | null,
): number | null {
  const same =
    (from === null ? null : normalizeUnit(from)) === (to === null ? null : normalizeUnit(to));
  if (same) return 1;
  if (!analyte) return null;
  const fromFactor = toCanonicalFactor(analyte, from);
  const toFactor = toCanonicalFactor(analyte, to);
  return fromFactor === null || toFactor === null ? null : fromFactor / toFactor;
}

/**
 * Converts a history to one unit. Value, refMin and refMax of a point always use the same factor,
 * so a point can never drift against its own range. Custom analytes (no catalog entry) convert
 * only between identical units.
 */
export function toSeries<T extends { measurement: Measurement }>(
  points: T[],
  analyte: Analyte | undefined,
  targetUnit: string | null,
): Series<T> {
  const series: Series<T> = { converted: [], unconvertible: [], nonNumeric: [] };
  for (const point of points) {
    const m = point.measurement;
    if (m.value === null) {
      series.nonNumeric.push(point);
      continue;
    }
    const factor = factorBetween(analyte, m.unit, targetUnit);
    if (factor === null) {
      series.unconvertible.push(point);
      continue;
    }
    series.converted.push({
      source: point,
      value: m.value * factor,
      comparator: m.comparator,
      refMin: m.refMin === null ? null : m.refMin * factor,
      refMax: m.refMax === null ? null : m.refMax * factor,
      unit: targetUnit,
    });
  }
  return series;
}

/** Points usable for trend geometry: exact values only ("<10" says nothing about direction). */
export function trendPoints<T>(converted: ConvertedPoint<T>[]): TrendPoint[] {
  return converted
    .filter((p) => p.comparator === null)
    .map(({ value, refMin, refMax }) => ({ value, refMin, refMax }));
}

/**
 * The unit a value is shown in (spec 2026-10-08 §4.3): the user's choice for this entry when
 * convertible, else the chosen unit system when the printed unit converts to it, else as printed.
 * Custom analytes (no catalog entry) and analytes without a conventional/SI pair (no `siUnit`)
 * always stay as printed.
 */
export function displayUnit(
  analyte: Analyte | undefined,
  printedUnit: string | null,
  options: { preferred?: string; system: UnitSystem },
): string | null {
  const printed = printedUnit === null ? null : normalizeUnit(printedUnit);
  if (!analyte) return printed;
  if (options.preferred !== undefined && toCanonicalFactor(analyte, options.preferred) !== null) {
    return normalizeUnit(options.preferred);
  }
  const target =
    analyte.siUnit === undefined
      ? undefined
      : options.system === 'conventional'
        ? analyte.canonicalUnit
        : options.system === 'si'
          ? analyte.siUnit
          : undefined;
  if (target !== undefined && printed !== null && toCanonicalFactor(analyte, printed) !== null) {
    return target;
  }
  return printed;
}
