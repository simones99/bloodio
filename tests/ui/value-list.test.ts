import { describe, expect, it } from 'vitest';
import type { CustomAnalyte, Measurement } from '../../src/domain/types';
import type { AnalyteLatest, SeriesPoint } from '../../src/storage/types';
import { formatRowValue } from '../../src/ui/analyte/analyte-view';
import { buildValueList } from '../../src/ui/analyte/value-list';

let counter = 0;
function point(sampleDate: string, overrides: Partial<Measurement> = {}): SeriesPoint {
  counter += 1;
  const measurement: Measurement = {
    id: `m${counter}`,
    reportId: `r-${sampleDate}`,
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
    order: 0,
    ...overrides,
  };
  return { measurement, reportId: measurement.reportId, sampleDate, lab: 'PROAVIS' };
}

function entry(latest: SeriesPoint, previous: SeriesPoint | null = null): AnalyteLatest {
  const m = latest.measurement;
  return {
    ref: m.analyteId
      ? { kind: 'catalog', id: m.analyteId }
      : { kind: 'custom', id: m.customAnalyteId! },
    latest,
    previous,
    count: previous ? 2 : 1,
  };
}

const glucose = (date: string, value: number, unit = 'mg/dL') =>
  point(date, {
    analyteId: 'glucose',
    value,
    valueText: String(value).replace('.', ','),
    unit,
    refMin: unit === 'mg/dL' ? 70 : 3.9,
    refMax: unit === 'mg/dL' ? 110 : 6.1,
    refText: null,
    outOfRange: false,
  });

const entries: AnalyteLatest[] = [
  entry(point('2022-08-20'), point('2021-10-04', { value: 5.31 })),
  entry(glucose('2022-08-20', 99)),
  entry(
    point('2022-08-20', {
      analyteId: 'rbc',
      value: 4960000,
      valueText: '4.960.000',
      unit: '/µL',
      refMin: 4500000,
      refMax: 5500000,
      outOfRange: false,
    }),
  ),
  entry(
    point('2022-08-20', {
      analyteId: 'ft4',
      value: 1.4,
      unit: 'ng/dL',
      refMin: 0.93,
      refMax: 1.7,
      outOfRange: false,
    }),
  ),
];

describe('buildValueList', () => {
  it('groups by category in the fixed order and sorts entries by name', () => {
    const groups = buildValueList(entries, [], {}, '');
    expect(groups.map((g) => g.category)).toEqual(['ematologia', 'tiroide', 'glicemia']);
    expect(groups[1]!.items.map((i) => i.name)).toEqual(['FT4', 'TSH']);
    expect(groups[1]!.items[1]).toMatchObject({ key: 'tsh', path: '/analytes/tsh' });
    expect(formatRowValue(groups[1]!.items[1]!.row)).toBe('5,07');
  });

  it('finds entries by name or alternative name, whatever the case and accents', () => {
    const glucoseOnly = buildValueList(entries, [], {}, 'GLUCÒSIO');
    expect(glucoseOnly.map((g) => g.category)).toEqual(['glicemia']);
    expect(buildValueList(entries, [], {}, 'tiroxina')[0]!.items.map((i) => i.name)).toEqual([
      'FT4',
    ]);
    expect(buildValueList(entries, [], {}, 'zzz')).toEqual([]);
  });

  it('shows the latest value in the preferred unit when it can be converted', () => {
    const [group] = buildValueList(
      [entry(glucose('2022-08-20', 99))],
      [],
      { glucose: 'mmol/L' },
      '',
    );
    expect(group!.items[0]!.row.unit).toBe('mmol/L');
    expect(formatRowValue(group!.items[0]!.row)).toBe('5,5');
  });

  it('ignores a preferred unit that cannot be converted', () => {
    const [group] = buildValueList([entry(glucose('2022-08-20', 99))], [], { glucose: 'g/L' }, '');
    expect(group!.items[0]!.row.unit).toBe('mg/dL');
  });

  it('flags "da tenere d\'occhio" from the latest two values only', () => {
    const rising = entry(
      point('2022-08-20', { value: 4.0, outOfRange: false }),
      point('2021-10-04', { value: 3.0, outOfRange: false }),
    );
    expect(buildValueList([rising], [], {}, '')[0]!.items[0]!.watch).toBe(true);
    const afterComparator = entry(
      point('2022-08-20', { value: 4.0, outOfRange: false }),
      point('2021-10-04', { value: 3.0, comparator: '<', outOfRange: false }),
    );
    expect(buildValueList([afterComparator], [], {}, '')[0]!.items[0]!.watch).toBe(false);
  });

  it('keeps a qualitative latest value as text', () => {
    const color = entry(
      point('2021-10-04', {
        analyteId: 'urine-color',
        value: null,
        valueText: 'Paglierino',
        unit: null,
        refMin: null,
        refMax: null,
        refText: null,
        outOfRange: null,
      }),
    );
    const [group] = buildValueList([color], [], {}, '');
    expect(group!.items[0]!.row.value).toBeNull();
    expect(formatRowValue(group!.items[0]!.row)).toBe('Paglierino');
  });

  it('names custom entries from their record, under their category', () => {
    const custom: CustomAnalyte[] = [
      {
        id: 'c1',
        name: 'Omocisteina',
        unit: 'µmol/L',
        category: 'altro',
        specimen: 'blood',
        kind: 'numeric',
      },
    ];
    const omocisteina = entry(
      point('2022-08-20', { analyteId: null, customAnalyteId: 'c1', value: 9, unit: 'µmol/L' }),
    );
    const groups = buildValueList([...entries, omocisteina], custom, {}, '');
    expect(groups[groups.length - 1]).toMatchObject({ category: 'altro' });
    expect(groups[groups.length - 1]!.items[0]).toMatchObject({
      name: 'Omocisteina',
      path: '/analytes/custom%3Ac1',
    });
  });
});
