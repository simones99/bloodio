import { describe, expect, it } from 'vitest';
import { getAnalyte } from '../../src/domain/catalog';
import { defaultDisplayUnit, toSeries, trendPoints } from '../../src/domain/series';
import { watchSide } from '../../src/domain/trend';
import type { Measurement } from '../../src/domain/types';

const m = (overrides: Partial<Measurement>): { measurement: Measurement; sampleDate: string } => ({
  sampleDate: '2025-01-01',
  measurement: {
    id: 'm',
    reportId: 'r',
    analyteId: 'ft4',
    customAnalyteId: null,
    value: 1.4,
    comparator: null,
    valueText: '1,40',
    unit: 'ng/dL',
    refMin: 0.93,
    refMax: 1.7,
    refText: 'da 0,93 a 1,7',
    outOfRange: false,
    confidence: 1,
    section: null,
    order: 0,
    ...overrides,
  },
});

const ft4 = getAnalyte('ft4');

describe('toSeries', () => {
  it('brings a mixed ng/dL and pg/mL FT4 history to one unit, range included', () => {
    const history = [
      m({ value: 7.1, unit: 'pg/mL', refMin: 5.4, refMax: 12.6 }), // AST Vallerosa
      m({ value: 1.4, unit: 'ng/dL', refMin: 0.93, refMax: 1.7 }), // PROAVIS
    ];
    const { converted, unconvertible, nonNumeric } = toSeries(history, ft4, 'ng/dL');
    expect(unconvertible).toEqual([]);
    expect(nonNumeric).toEqual([]);
    expect(converted.map((p) => p.unit)).toEqual(['ng/dL', 'ng/dL']);
    expect(converted[0]?.value).toBeCloseTo(0.71, 10);
    expect(converted[0]?.refMin).toBeCloseTo(0.54, 10);
    expect(converted[0]?.refMax).toBeCloseTo(1.26, 10);
    expect(converted[1]).toMatchObject({ value: 1.4, refMin: 0.93, refMax: 1.7 });
    expect(converted[0]?.source).toBe(history[0]);
  });

  it('converts the other way too', () => {
    const { converted } = toSeries([m({})], ft4, 'pg/mL');
    expect(converted[0]?.value).toBeCloseTo(14, 10);
    expect(converted[0]?.refMax).toBeCloseTo(17, 10);
  });

  it('sets apart units it cannot convert instead of plotting them raw', () => {
    const odd = m({ unit: 'mg/L' });
    const series = toSeries([m({}), odd], ft4, 'ng/dL');
    expect(series.converted).toHaveLength(1);
    expect(series.unconvertible).toEqual([odd]);
  });

  it('keeps qualitative results out of the numeric series', () => {
    const absent = m({ value: null, valueText: 'Assente', unit: null });
    expect(toSeries([absent], getAnalyte('urine-glucose'), null).nonNumeric).toEqual([absent]);
  });

  it('keeps comparators and tolerates one-sided ranges', () => {
    const { converted } = toSeries(
      [m({ value: 10, comparator: '<', refMin: null, refMax: 20, unit: 'UI/mL' })],
      getAnalyte('anti-tpo'),
      'UI/mL',
    );
    expect(converted[0]).toMatchObject({ value: 10, comparator: '<', refMin: null, refMax: 20 });
  });

  it('handles unitless analytes and custom analytes by exact unit', () => {
    const gravity = m({
      analyteId: 'urine-specific-gravity',
      value: 1.029,
      unit: null,
      refMin: 1.007,
      refMax: 1.035,
    });
    expect(toSeries([gravity], getAnalyte('urine-specific-gravity'), null).converted).toHaveLength(
      1,
    );
    const custom = [
      m({ analyteId: null, customAnalyteId: 'c1', unit: 'mg/dl' }),
      m({ analyteId: null, customAnalyteId: 'c1', unit: 'g/L' }),
    ];
    const series = toSeries(custom, undefined, 'mg/dL');
    expect(series.converted).toHaveLength(1);
    expect(series.unconvertible).toHaveLength(1);
  });
});

describe('trendPoints', () => {
  it('feeds watchSide with converted values and skips comparator points', () => {
    const history = [
      m({ value: 9.0, unit: 'pg/mL', refMin: 5.4, refMax: 12.6 }),
      m({ value: 5, comparator: '<', unit: 'pg/mL', refMin: 5.4, refMax: 12.6 }),
      m({ value: 1.18, unit: 'ng/dL', refMin: 0.54, refMax: 1.26 }),
    ];
    const points = trendPoints(toSeries(history, ft4, 'pg/mL').converted);
    expect(points).toHaveLength(2);
    expect(points[1]?.value).toBeCloseTo(11.8, 10);
    expect(watchSide(points)).toBe('upper');
  });
});

describe('defaultDisplayUnit', () => {
  it('prefers the user choice when the analyte can convert to it', () => {
    expect(defaultDisplayUnit(ft4, 'ng/dl', 'pmol/L')).toBe('pmol/L');
    expect(defaultDisplayUnit(ft4, 'ng/dl', 'g/L')).toBe('ng/dL');
    expect(defaultDisplayUnit(ft4, 'ng/dl')).toBe('ng/dL');
    expect(defaultDisplayUnit(undefined, null)).toBeNull();
  });
});
