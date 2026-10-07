import { describe, expect, it } from 'vitest';
import type { CustomAnalyte, Measurement } from '../../src/domain/types';
import type { SeriesPoint } from '../../src/storage/types';
import {
  analytePath,
  buildAnalyteView,
  formatRowRange,
  formatRowValue,
} from '../../src/ui/analyte/analyte-view';

let counter = 0;
function at(
  sampleDate: string,
  overrides: Partial<Measurement> = {},
  lab = 'PROAVIS',
): SeriesPoint {
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
  return { measurement, reportId: measurement.reportId, sampleDate, lab };
}

const TSH = { kind: 'catalog', id: 'tsh' } as const;
const GLUCOSE = { kind: 'catalog', id: 'glucose' } as const;

function glucose(sampleDate: string, value: number, unit: string, range: [number, number]) {
  return at(sampleDate, {
    analyteId: 'glucose',
    value,
    valueText: String(value).replace('.', ','),
    unit,
    refMin: range[0],
    refMax: range[1],
    refText: null,
    outOfRange: false,
  });
}

describe('buildAnalyteView', () => {
  const history = [
    at('2022-08-20', { value: 5.07, valueText: '5,07' }),
    at('2021-07-10', { value: 5.48, valueText: '5,48' }),
    at('2021-10-04', { value: 5.31, valueText: '5,31' }),
  ];

  it('orders the chart oldest first and the table newest first', () => {
    const view = buildAnalyteView(history, TSH, []);
    expect(view.chartPoints.map((p) => p.date)).toEqual(['2021-07-10', '2021-10-04', '2022-08-20']);
    expect(view.rows.map((r) => r.sampleDate)).toEqual(['2022-08-20', '2021-10-04', '2021-07-10']);
    expect(view.latest?.value).toBe(5.07);
    expect(view.name).toBe('TSH');
    expect(view.category).toBe('tiroide');
  });

  it('describes the chart in words, without interpretation', () => {
    expect(buildAnalyteView(history, TSH, []).summary).toBe(
      'TSH da luglio 2021 ad agosto 2022: 3 misure, 3 sopra il range stampato, da 5,48 a 5,07 µUI/mL.',
    );
  });

  it('words the image subtitle and dates it by the latest plotted point', () => {
    expect(buildAnalyteView(history, TSH, []).image).toEqual({
      subtitle: 'µUI/mL · luglio 2021 – agosto 2022',
      date: '2022-08-20',
    });
    expect(buildAnalyteView(history.slice(0, 1), TSH, []).image).toBeNull();
  });

  it('has no summary below two plotted points', () => {
    expect(buildAnalyteView(history.slice(0, 1), TSH, []).summary).toBeNull();
  });

  it('offers the catalog units, current one included, and converts value and range together', () => {
    const points = [
      glucose('2021-10-04', 5, 'mmol/L', [3.9, 6.1]),
      glucose('2022-08-20', 99, 'mg/dL', [70, 110]),
    ];
    const byDefault = buildAnalyteView(points, GLUCOSE, []);
    expect(byDefault.unit).toBe('mg/dL');
    expect(byDefault.unitOptions).toEqual(['mg/dL', 'mmol/L']);
    expect(byDefault.rows[1]).toMatchObject({ converted: true, exact: false });
    expect(formatRowValue(byDefault.rows[1]!)).toBe('90,1');

    const inMmol = buildAnalyteView(points, GLUCOSE, [], 'mmol/L');
    expect(inMmol.unit).toBe('mmol/L');
    expect(formatRowValue(inMmol.rows[0]!)).toBe('5,5');
    expect(formatRowRange(inMmol.rows[0]!)).toBe('3,89 – 6,11');
    expect(formatRowValue(inMmol.rows[1]!)).toBe('5');
    expect(inMmol.rows[1]).toMatchObject({ converted: true, exact: true });
  });

  it('ignores a preferred unit that this analyte cannot be shown in', () => {
    const view = buildAnalyteView(
      [glucose('2022-08-20', 99, 'mg/dL', [70, 110])],
      GLUCOSE,
      [],
      'g/L',
    );
    expect(view.unit).toBe('mg/dL');
  });

  it('keeps values in an unconvertible unit out of the chart, in the table with their own unit', () => {
    const points = [
      glucose('2021-08-30', 0.9, 'g/L', [0.7, 1.1]),
      glucose('2021-10-04', 87, 'mg/dL', [70, 110]),
      glucose('2022-08-20', 99, 'mg/dL', [70, 110]),
    ];
    const view = buildAnalyteView(points, GLUCOSE, []);
    expect(view.chartPoints).toHaveLength(2);
    expect(view.excludedCount).toBe(1);
    const old = view.rows[2]!;
    expect(old).toMatchObject({ converted: false, exact: true, unit: 'g/L', value: 0.9 });
    expect(formatRowValue(old)).toBe('0,9');
  });

  it('shows the latest report in the header as printed, even when its unit cannot be converted', () => {
    const points = [
      glucose('2021-10-04', 87, 'mg/dL', [70, 110]),
      glucose('2022-08-20', 0.9, 'g/L', [0.7, 1.1]),
    ];
    const view = buildAnalyteView(points, GLUCOSE, [], 'mg/dL');
    expect(view.latest).toMatchObject({ sampleDate: '2022-08-20', unit: 'g/L', converted: false });
    expect(view.watch).toBe(false);
  });

  it('handles a qualitative analyte: text in the header, nothing to plot, no units', () => {
    const points = [
      at('2021-10-04', {
        analyteId: 'urine-color',
        value: null,
        valueText: 'Paglierino',
        unit: null,
        refMin: null,
        refMax: null,
        refText: null,
        outOfRange: null,
      }),
    ];
    const view = buildAnalyteView(points, { kind: 'catalog', id: 'urine-color' }, []);
    expect(view.chartPoints).toEqual([]);
    expect(view.unitOptions).toEqual([]);
    expect(view.latest && formatRowValue(view.latest)).toBe('Paglierino');
    expect(view.excludedCount).toBe(0);
  });

  it('names a custom analyte from its own record and offers only its printed unit', () => {
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
    const points = [
      at('2022-08-20', { analyteId: null, customAnalyteId: 'c1', value: 9, unit: 'µmol/L' }),
    ];
    const view = buildAnalyteView(points, { kind: 'custom', id: 'c1' }, custom);
    expect(view.name).toBe('Omocisteina');
    expect(view.category).toBe('altro');
    expect(view.unitOptions).toEqual(['µmol/L']);
  });

  it('flags "da tenere d\'occhio" only when the latest value is close to a limit and moving towards it', () => {
    const rising = [
      at('2025-01-01', { value: 3.0, outOfRange: false }),
      at('2025-06-01', { value: 4.0, outOfRange: false }),
    ];
    expect(buildAnalyteView(rising, TSH, []).watch).toBe(true);
    expect(buildAnalyteView(history, TSH, []).watch).toBe(false);
  });

  it('is empty, not broken, for a ref without data', () => {
    const view = buildAnalyteView([], { kind: 'catalog', id: 'ldl' }, []);
    expect(view.rows).toEqual([]);
    expect(view.latest).toBeNull();
    expect(view.summary).toBeNull();
  });

  it('describes every plotted point for its detail box', () => {
    const view = buildAnalyteView(history, TSH, []);
    const latest = view.chartPoints[view.chartPoints.length - 1]!;
    expect(Object.keys(view.pointDetails)).toEqual(view.chartPoints.map((p) => p.key));
    expect(view.pointDetails[latest.key]).toEqual({
      label: '20 ago 2022: 5,07 µUI/mL, sopra il range stampato',
      value: '5,07 µUI/mL',
      date: '20 agosto 2022',
      lab: 'PROAVIS',
      href: '/reports/r-2022-08-20',
    });
  });

  it('words an in-range point as such', () => {
    const view = buildAnalyteView(
      [
        at('2025-01-01', { value: 2, outOfRange: false }),
        at('2025-06-01', { value: 3, outOfRange: false }),
      ],
      TSH,
      [],
    );
    expect(Object.values(view.pointDetails)[0]!.label).toBe(
      '1 gen 2025: 2 µUI/mL, dentro il range stampato',
    );
  });
});

describe('row formatting', () => {
  it('writes ranges compactly and one-sided printed ranges as printed', () => {
    const [two] = buildAnalyteView([at('2022-08-20')], TSH, []).rows;
    expect(formatRowRange(two!)).toBe('0,27 – 4,2');
    const [upTo] = buildAnalyteView(
      [at('2022-08-20', { refMin: null, refMax: 77, refText: 'Fino a 77,0' })],
      TSH,
      [],
    ).rows;
    expect(formatRowRange(upTo!)).toBe('Fino a 77,0');
    const [none] = buildAnalyteView(
      [at('2022-08-20', { refMin: null, refMax: null, refText: null })],
      TSH,
      [],
    ).rows;
    expect(formatRowRange(none!)).toBeNull();
  });

  it('keeps the comparator in front of the value', () => {
    const [row] = buildAnalyteView(
      [at('2022-08-20', { value: 10, comparator: '<', valueText: '<10' })],
      TSH,
      [],
    ).rows;
    expect(formatRowValue(row!)).toBe('<10');
  });

  it('builds analyte paths that survive the router', () => {
    expect(analytePath({ kind: 'catalog', id: 'tsh' })).toBe('/analytes/tsh');
    expect(analytePath({ kind: 'custom', id: 'c1' })).toBe('/analytes/custom%3Ac1');
  });

  it('reads "ad aprile" in a one-month series and "a ottobre" after October', () => {
    const sameMonth = [
      glucose('2026-04-02', 90, 'mg/dL', [70, 110]),
      glucose('2026-04-20', 95, 'mg/dL', [70, 110]),
    ];
    expect(buildAnalyteView(sameMonth, GLUCOSE, []).summary).toContain('ad aprile 2026: ');
    const toOctober = [
      glucose('2026-04-02', 90, 'mg/dL', [70, 110]),
      glucose('2026-10-01', 95, 'mg/dL', [70, 110]),
    ];
    const summary = buildAnalyteView(toOctober, GLUCOSE, []).summary;
    expect(summary).toContain('da aprile 2026 a ottobre 2026');
  });

  it('keeps offering the printed unit when it is not in the catalog', () => {
    const points = [glucose('2022-08-20', 99, 'mg/100mL', [70, 110])];
    const view = buildAnalyteView(points, GLUCOSE, [], 'mg/dL');
    expect(view.unitOptions).toContain('mg/100mL');
    expect(view.unitOptions).toContain('mg/dL');
    expect(view.unitOptions.indexOf('mg/dL')).toBeLessThan(view.unitOptions.indexOf('mg/100mL'));
  });
});
