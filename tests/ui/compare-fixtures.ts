import type { Measurement, Report } from '../../src/domain/types';
import {
  buildComparison,
  type ComparisonInput,
  type ComparisonRow,
  type ComparisonView,
} from '../../src/ui/compare/compare-view';

export function report(
  id: string,
  sampleDate: string,
  createdAt = '2026-01-01T00:00:00.000Z',
  lab = 'PROAVIS',
): Report {
  return {
    id,
    profileId: 'default',
    sampleDate,
    lab,
    type: 'sangue',
    source: 'parser',
    adapterId: 'proavis',
    notes: '',
    fileHash: null,
    createdAt,
    updatedAt: createdAt,
  };
}

/** The `listEntryRefsByReport` shape from a plain object. */
export function refsOf(entries: Record<string, string[]>): Map<string, Set<string>> {
  return new Map(Object.entries(entries).map(([id, keys]) => [id, new Set(keys)]));
}

let counter = 0;

/** A stored measurement, TSH 5,07 out of range by default. `order` grows with every call. */
export function measurement(reportId: string, overrides: Partial<Measurement> = {}): Measurement {
  counter += 1;
  return {
    id: `m${counter}`,
    reportId,
    analyteId: 'tsh',
    customAnalyteId: null,
    value: 5.07,
    comparator: null,
    valueText: '5,07',
    unit: 'µUI/mL',
    refMin: 0.27,
    refMax: 4.2,
    refText: 'da 0,27 a 4,20',
    outOfRange: true,
    confidence: 1,
    section: null,
    order: counter,
    ...overrides,
  };
}

export const OLDER = report('older', '2021-10-04');
export const NEWER = report('newer', '2022-08-20');

export function compare(
  older: Partial<Measurement>[],
  newer: Partial<Measurement>[],
  options: Partial<Pick<ComparisonInput, 'custom' | 'preferred' | 'system'>> = {},
): ComparisonView {
  return buildComparison({
    older: { report: OLDER, measurements: older.map((o) => measurement(OLDER.id, o)) },
    newer: { report: NEWER, measurements: newer.map((o) => measurement(NEWER.id, o)) },
    custom: [],
    preferred: {},
    system: 'printed',
    ...options,
  });
}

export const allRows = (view: ComparisonView): ComparisonRow[] => [
  ...view.changed,
  ...view.groups.flatMap((g) => g.rows),
];

export function rowOf(view: ComparisonView, key: string): ComparisonRow {
  const row = allRows(view).find((r) => r.key === key);
  if (!row) throw new Error(`no row ${key}`);
  return row;
}

const decimalText = (value: number) => String(value).replace('.', ',');

/** TSH, range 0,27 – 4,20, out of range computed from the value. */
export const tsh = (value: number, overrides: Partial<Measurement> = {}): Partial<Measurement> => ({
  value,
  valueText: decimalText(value),
  outOfRange: value < 0.27 || value > 4.2,
  ...overrides,
});

/** Glicemia in mg/dL, range 70 – 100, out of range computed from the value. */
export const glucose = (
  value: number,
  overrides: Partial<Measurement> = {},
): Partial<Measurement> => ({
  analyteId: 'glucose',
  value,
  valueText: decimalText(value),
  unit: 'mg/dL',
  refMin: 70,
  refMax: 100,
  refText: 'da 70 a 100',
  outOfRange: value < 70 || value > 100,
  ...overrides,
});

/** A custom entry "Omocisteina" (id c1) in the given unit. */
export const homocysteine = (value: number, unit: string): Partial<Measurement> => ({
  analyteId: null,
  customAnalyteId: 'c1',
  value,
  valueText: decimalText(value),
  unit,
  refMin: 5,
  refMax: 15,
  refText: null,
  outOfRange: false,
});

export const CUSTOM = [
  {
    id: 'c1',
    name: 'Omocisteina',
    unit: 'µmol/L',
    category: 'altro' as const,
    specimen: 'blood' as const,
    kind: 'numeric' as const,
  },
];
