import { describe, expect, it } from 'vitest';
import { comparePath } from '../../src/ui/compare/compare-view';
import { allRows, compare, CUSTOM, glucose, homocysteine, rowOf, tsh } from './compare-fixtures';

const ft4 = tsh(1.56, {
  analyteId: 'ft4',
  unit: 'ng/dL',
  refMin: 0.93,
  refMax: 1.7,
  refText: null,
  outOfRange: false,
});
const rbc = tsh(4220000, {
  analyteId: 'rbc',
  valueText: '4.220.000',
  unit: '/µL',
  refMin: 4500000,
  refMax: 5500000,
  refText: null,
  outOfRange: false,
});

describe('buildComparison', () => {
  it('pairs the two reports by entry and subtracts in the printed unit', () => {
    const row = rowOf(compare([tsh(5.31), glucose(92)], [tsh(5.07), glucose(104)]), 'tsh#0');
    expect(row).toMatchObject({ kind: 'numeric', name: 'TSH', path: '/analytes/tsh' });
    expect([row.older?.value, row.newer?.value, row.newer?.unit]).toEqual([5.31, 5.07, 'µUI/mL']);
    expect(row.delta?.absolute).toBeCloseTo(-0.24);
    expect(row.delta?.percent).toBeCloseTo(-4.52, 2);
    expect(row.delta?.decimals).toBe(2);
    expect([row.transition, row.rangeChanged, row.limit]).toEqual([null, null, null]);
  });

  it('puts first the entries that went into or out of the range, in category order', () => {
    const view = compare([glucose(90), tsh(5.07)], [glucose(65), tsh(2)]);
    expect(view.changed.map((r) => [r.key, r.transition])).toEqual([
      ['tsh#0', 'now-in'],
      ['glucose#0', 'now-below'],
    ]);
    expect(view.groups).toEqual([]);
    expect(rowOf(compare([glucose(92)], [glucose(104)]), 'glucose#0').transition).toBe('now-above');
  });

  it('converts the older value to the unit of the recent one', () => {
    const older = glucose(5.1, {
      unit: 'mmol/L',
      refMin: 3.9,
      refMax: 5.6,
      refText: 'da 3,9 a 5,6',
      outOfRange: false,
    });
    const row = rowOf(compare([older], [glucose(95)]), 'glucose#0');
    expect(row.kind).toBe('numeric');
    expect(row.older?.unit).toBe('mg/dL');
    expect(row.older?.value).toBeCloseTo(91.88, 2);
    expect(row.delta?.absolute).toBeCloseTo(3.12, 2);
    expect(row.delta?.decimals).toBeNull();
    expect(row.rangeChanged).toEqual({ from: '70,3 – 101', to: '70 – 100' });
  });

  it('follows the unit system of the settings', () => {
    const row = rowOf(compare([glucose(92)], [glucose(104)], { system: 'si' }), 'glucose#0');
    expect(row.newer?.unit).toBe('mmol/L');
    expect(row.newer?.value).toBeCloseTo(5.773, 3);
    expect(row.delta?.decimals).toBeNull();
  });

  it('keeps entries of one report only, at the end of their category (rule 1)', () => {
    const view = compare([ft4, tsh(5.31)], [tsh(5.07), rbc]);
    expect(view.groups.map((g) => [g.category, g.rows.map((r) => r.key)])).toEqual([
      ['ematologia', ['rbc#0']],
      ['tiroide', ['tsh#0', 'ft4#0']],
    ]);
    const only = rowOf(view, 'ft4#0');
    expect([only.kind, only.newer, only.delta, only.transition]).toEqual([
      'single',
      null,
      null,
      null,
    ]);
    expect(only.older?.value).toBe(1.56);
    expect([view.common, view.single]).toEqual([1, 2]);
  });

  it('does not subtract values in units that cannot be converted (rule 2)', () => {
    const view = compare([homocysteine(9, 'µmol/L')], [homocysteine(1.2, 'mg/L')], {
      custom: CUSTOM,
    });
    const row = rowOf(view, 'custom:c1#0');
    expect(row).toMatchObject({ kind: 'units', name: 'Omocisteina', category: 'altro' });
    expect([row.delta, row.rangeChanged]).toEqual([null, null]);
    expect([row.older?.unit, row.newer?.unit]).toEqual(['µmol/L', 'mg/L']);
  });

  it('compares qualitative results as text, and they can still change side (rule 3)', () => {
    const protein = (valueText: string, outOfRange: boolean, refText = 'Assente') => ({
      analyteId: 'urine-protein',
      value: null,
      valueText,
      unit: null,
      refMin: null,
      refMax: null,
      refText,
      outOfRange,
    });
    const view = compare([protein('Assente', false)], [protein('Tracce', true)]);
    const row = rowOf(view, 'urine-protein#0');
    expect([row.kind, row.delta, row.transition, row.rangeChanged]).toEqual([
      'qualitative',
      null,
      'now-out',
      null,
    ]);
    expect(view.changed).toEqual([row]);
    const relabelled = compare(
      [protein('Assente', false)],
      [protein('Assente', false, 'Negativo')],
    );
    expect(rowOf(relabelled, 'urine-protein#0').rangeChanged).toEqual({
      from: 'Assente',
      to: 'Negativo',
    });
  });

  it('does not subtract a value printed as a limit (rule 4)', () => {
    const limit = (value: number, comparator: '<' | null) =>
      glucose(value, {
        comparator,
        valueText: `${comparator ?? ''}${value}`,
        refMin: null,
        refMax: 20,
        refText: '< 20',
        outOfRange: false,
      });
    const at = (older: number, olderCmp: '<' | null, newer: number, newerCmp: '<' | null) =>
      rowOf(compare([limit(older, olderCmp)], [limit(newer, newerCmp)]), 'glucose#0');
    expect(at(9, '<', 12, null)).toMatchObject({ kind: 'numeric', delta: null, limit: 'older' });
    expect(at(12, null, 9, '<').limit).toBe('newer');
    expect(at(9, '<', 9, '<').limit).toBe('both');
    expect(at(10, null, 12, null).limit).toBeNull();
  });

  it('leaves values that cannot be evaluated out of the changed block (rule 5)', () => {
    const view = compare([glucose(92, { outOfRange: null })], [glucose(104)]);
    expect(view.changed).toEqual([]);
    expect(rowOf(view, 'glucose#0').transition).toBeNull();
  });

  it('has no percentage from zero (rule 6)', () => {
    expect(rowOf(compare([tsh(0)], [tsh(0.5)]), 'tsh#0').delta).toEqual({
      absolute: 0.5,
      percent: null,
      decimals: 1,
    });
  });

  it('counts the decimals of values printed with a decimal point, not of thousands', () => {
    const gravity = (valueText: string) => ({
      analyteId: 'urine-specific-gravity',
      value: Number(valueText),
      valueText,
      unit: null,
      refMin: 1.007,
      refMax: 1.035,
      refText: 'da 1.007 a 1.035',
      outOfRange: false,
    });
    const row = rowOf(compare([gravity('1.015')], [gravity('1.029')]), 'urine-specific-gravity#0');
    expect(row.delta?.absolute).toBeCloseTo(0.014, 6);
    expect(row.delta?.decimals).toBe(3);
    const cells = (value: number, valueText: string) =>
      tsh(value, {
        analyteId: 'rbc',
        valueText,
        unit: '/µL',
        refMin: 4500000,
        refMax: 5500000,
        refText: 'da 4.500.000 a 5.500.000',
        outOfRange: false,
      });
    const rbcRow = rowOf(
      compare([cells(4220000, '4.220.000')], [cells(5000000, '5.000.000')]),
      'rbc#0',
    );
    expect(rbcRow.delta).toMatchObject({ absolute: 780000, decimals: 0 });
    const dotted = rowOf(
      compare([tsh(5.31, { valueText: '5.31' })], [tsh(5.07, { valueText: '5.07' })]),
      'tsh#0',
    );
    expect(dotted.delta?.decimals).toBe(2);
  });

  it('notes a printed range that changed between the two reports', () => {
    const tpo = (value: number, max: number) =>
      tsh(value, { refMin: null, refMax: max, refText: `< ${max}`, outOfRange: value > max });
    expect(rowOf(compare([tpo(28, 34)], [tpo(15, 20)]), 'tsh#0').rangeChanged).toEqual({
      from: '< 34',
      to: '< 20',
    });
  });

  it('pairs repeated entries in report order and keeps the extra ones apart', () => {
    const view = compare([tsh(5.31), tsh(6.3)], [tsh(5.07)]);
    expect(rowOf(view, 'tsh#0').older?.value).toBe(5.31);
    expect(rowOf(view, 'tsh#1')).toMatchObject({ kind: 'single', newer: null });
  });

  it('leaves out rows never assigned to an entry', () => {
    const view = compare([tsh(5.31, { analyteId: null })], [tsh(5.07)]);
    expect(allRows(view).map((r) => [r.key, r.kind])).toEqual([['tsh#0', 'single']]);
  });
});

describe('comparePath', () => {
  it('builds the address of a comparison', () => {
    expect(comparePath('a b', 'c')).toBe('/compare?a=a%20b&b=c');
  });
});
