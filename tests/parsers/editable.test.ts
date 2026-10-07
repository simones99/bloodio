import { describe, expect, it } from 'vitest';
import { buildDraftRow } from '../../src/parsers/draft';
import {
  ambiguousReadings,
  editableToMeasurementInput,
  emptyEditableRow,
  formatNumber,
  isPending,
  measurementToEditableRow,
  parseUserNumber,
  rowProblems,
  toEditableRow,
  withAnalyte,
  withReading,
  withSuggestedReference,
} from '../../src/parsers/editable';
import { parseReport } from '../../src/parsers/registry';
import { loadFixture } from '../fixtures/load';
import type { Measurement } from '../../src/domain/types';
import type { LatestReference } from '../../src/storage/types';
import { measurementInput } from '../storage/helpers';

const report = parseReport(loadFixture('proavis-2021-10-04'));
const draft = (rawName: string, section?: string) => {
  const row = report.rows.find((r) => r.rawName === rawName && (!section || r.section === section));
  if (!row) throw new Error(rawName);
  return row;
};

describe('number text', () => {
  it('formats without grouping and with a decimal comma', () => {
    expect(formatNumber(4320000)).toBe('4320000');
    expect(formatNumber(1.029)).toBe('1,029');
  });
  it.each([
    ['13,8', 13.8],
    ['13.8', 13.8],
    ['1,029', 1.029],
    [' 95 ', 95],
  ])('reads %j typed by the user as %d', (text, expected) => {
    expect(parseUserNumber(text)).toBe(expected);
  });
  it.each(['4.220.000', '1,2,3', 'abc', '', '<10'])('rejects %j', (text) => {
    expect(parseUserNumber(text)).toBeNull();
  });
});

describe('toEditableRow', () => {
  it('turns a parsed row into editable text', () => {
    const row = toEditableRow(draft('Globuli rossi'), 'k1');
    expect(row).toMatchObject({
      key: 'k1',
      name: 'Globuli rossi',
      analyteId: 'rbc',
      valueText: '4320000',
      unit: '/µL',
      refMinText: '4500000',
      refMaxText: '5500000',
      refText: 'da 4.500.000 a 5.500.000',
      confirmed: false,
    });
    expect(row.origin?.rawValue).toBe('4.320.000');
    expect(isPending(row)).toBe(false);
  });
  it('keeps comparators and qualitative text', () => {
    const tpo = parseReport(loadFixture('proavis-2022-08-20')).rows.find(
      (r) => r.rawValue === '<10',
    )!;
    expect(toEditableRow(tpo, 'k').valueText).toBe('<10');
    expect(toEditableRow(draft('Colore'), 'k').valueText).toBe('Giallo ambrato');
  });
  it('marks flagged rows as pending until confirmed', () => {
    const row = toEditableRow(draft('Vitamina D (25 OH)'), 'k');
    expect(row.flags).toEqual(['derived-ref']);
    expect(isPending(row)).toBe(true);
    expect(isPending({ ...row, confirmed: true })).toBe(false);
  });
});

describe('editableToMeasurementInput', () => {
  it('stores the value as printed when the user did not touch it', () => {
    const input = editableToMeasurementInput(toEditableRow(draft('Globuli rossi'), 'k'));
    expect(input).toMatchObject({
      analyteId: 'rbc',
      customAnalyteId: null,
      value: 4320000,
      comparator: null,
      valueText: '4.320.000',
      unit: '/µL',
      refMin: 4500000,
      refMax: 5500000,
      confidence: 1,
      section: 'EMOCROMO',
    });
  });
  it('stores what the user typed after an edit', () => {
    const row = {
      ...toEditableRow(draft('Glicemia'), 'k'),
      valueText: '92,5',
      unit: 'mg/dl',
      refMaxText: '',
    };
    expect(editableToMeasurementInput(row)).toMatchObject({
      value: 92.5,
      valueText: '92,5',
      unit: 'mg/dL',
      refMin: 70,
      refMax: null,
    });
  });
  it('reads comparators and qualitative values', () => {
    const base = { ...emptyEditableRow('k'), analyteId: 'anti-tpo' };
    expect(editableToMeasurementInput({ ...base, valueText: '< 10' })).toMatchObject({
      value: 10,
      comparator: '<',
      valueText: '< 10',
    });
    expect(editableToMeasurementInput({ ...base, valueText: 'Assente' })).toMatchObject({
      value: null,
      comparator: null,
      valueText: 'Assente',
      unit: null,
      refText: null,
    });
  });
  it('raises confidence to 1 once the user confirmed a doubtful row', () => {
    const row = toEditableRow(draft('Vitamina D (25 OH)'), 'k');
    expect(editableToMeasurementInput({ ...row, confirmed: true }).confidence).toBe(1);
  });
  it('refuses rows that still have problems', () => {
    expect(() => editableToMeasurementInput(emptyEditableRow('k'))).toThrow('cannot be saved');
  });
  it('carries the row measurementId through as the input id', () => {
    const row = measurementToEditableRow(
      { id: 'm42', reportId: 'r1', outOfRange: false, order: 0, ...measurementInput() },
      'k',
    );
    expect(editableToMeasurementInput(row).id).toBe('m42');
  });
  it('produces an undefined id for a row with no measurementId', () => {
    const row = { ...emptyEditableRow('k'), analyteId: 'tsh', valueText: '5,07' };
    expect(row.measurementId).toBeNull();
    expect(editableToMeasurementInput(row).id).toBeUndefined();
  });
});

describe('ambiguousReadings and withReading', () => {
  const ambiguousDraft = () =>
    buildDraftRow({
      name: 'Un analita sconosciuto',
      value: '1.250',
      unit: '',
      ref: '',
      section: null,
      page: 0,
      bbox: { x: 0, y: 0, w: 0, h: 0 },
    });

  it('offers the decimal and thousands readings of an ambiguous printed number', () => {
    const row = toEditableRow(ambiguousDraft(), 'k');
    expect(row.flags).toContain('ambiguous-number');
    expect(ambiguousReadings(row)).toEqual(['1,25', '1250']);
  });

  it('keeps a comparator prefix in both readings', () => {
    const draft = buildDraftRow({
      name: 'Un analita sconosciuto',
      value: '<1.250',
      unit: '',
      ref: '',
      section: null,
      page: 0,
      bbox: { x: 0, y: 0, w: 0, h: 0 },
    });
    const row = toEditableRow(draft, 'k');
    expect(ambiguousReadings(row)).toEqual(['<1,25', '<1250']);
  });

  it('offers nothing when the row has no ambiguous-number flag', () => {
    expect(ambiguousReadings(toEditableRow(draft('Glicemia'), 'k'))).toBeNull();
  });

  it('applies a reading and resolves the doubt, keeping other flags', () => {
    const row = {
      ...toEditableRow(ambiguousDraft(), 'k'),
      flags: ['ambiguous-number', 'unknown-analyte'] as const,
    };
    const applied = withReading({ ...row, flags: [...row.flags] }, '1,25');
    expect(applied.valueText).toBe('1,25');
    expect(applied.flags).toEqual(['unknown-analyte']);
  });
});

describe('rowProblems and withAnalyte', () => {
  it('lists what stops a row from being saved', () => {
    expect(rowProblems(emptyEditableRow('k'))).toEqual(['no-analyte', 'no-value']);
    const row = {
      ...emptyEditableRow('k'),
      analyteId: 'tsh',
      valueText: '5',
      refMinText: '4,2',
      refMaxText: '0,27',
    };
    expect(rowProblems(row)).toEqual(['ref-order']);
    expect(rowProblems({ ...row, refMinText: 'x', refMaxText: '1.000.000' })).toEqual([
      'bad-ref-min',
      'bad-ref-max',
    ]);
    expect(rowProblems({ ...row, refMinText: '0,27', refMaxText: '4,2' })).toEqual([]);
  });
  it('clears analyte doubts when the user picks an analyte', () => {
    const unknown = {
      ...emptyEditableRow('k'),
      flags: ['unknown-analyte', 'ambiguous-number'] as const,
      confidence: 0,
    };
    const chosen = withAnalyte(
      { ...unknown, flags: [...unknown.flags] },
      { customAnalyteId: 'c1' },
    );
    expect(chosen).toMatchObject({
      analyteId: null,
      customAnalyteId: 'c1',
      flags: ['ambiguous-number'],
      confidence: 0.8,
    });
    expect(withAnalyte(chosen, { analyteId: 'tsh' })).toMatchObject({
      analyteId: 'tsh',
      customAnalyteId: null,
      suggestedReference: null,
    });
  });
});

describe('withSuggestedReference', () => {
  const latest: LatestReference = {
    unit: 'mg/dL',
    refMin: 70,
    refMax: 110,
    refText: 'da 70 a 110',
    sampleDate: '2022-08-20',
  };

  it('fills unit, range and the suggestion marker from the latest reference', () => {
    const row = withSuggestedReference(emptyEditableRow('k'), latest);
    expect(row).toMatchObject({
      unit: 'mg/dL',
      refMinText: '70',
      refMaxText: '110',
      refText: 'da 70 a 110',
      suggestedReference: { sampleDate: '2022-08-20' },
    });
  });

  it('leaves unit, range and text empty when the latest reference has none', () => {
    const row = withSuggestedReference(emptyEditableRow('k'), {
      unit: null,
      refMin: null,
      refMax: null,
      refText: null,
      sampleDate: '2022-08-20',
    });
    expect(row).toMatchObject({
      unit: '',
      refMinText: '',
      refMaxText: '',
      refText: '',
      suggestedReference: null,
    });
  });
});

describe('measurementToEditableRow', () => {
  const asMeasurement = (overrides: Partial<Measurement> = {}): Measurement => ({
    id: 'm1',
    reportId: 'r1',
    outOfRange: false,
    order: 0,
    ...measurementInput(),
    ...overrides,
  });

  it('formats a numeric measurement the same way a fresh reading would', () => {
    const row = measurementToEditableRow(asMeasurement(), 'k');
    expect(row).toMatchObject({
      key: 'k',
      name: '',
      analyteId: 'tsh',
      customAnalyteId: null,
      suggestionId: null,
      valueText: '5,07',
      unit: 'µUI/mL',
      refMinText: '0,27',
      refMaxText: '4,2',
      refText: 'da 0,27 a 4,20',
      section: 'MONITORAGGIO TIROIDE',
      confidence: 1,
      flags: [],
      confirmed: true,
      origin: null,
      measurementId: 'm1',
    });
  });

  it('keeps a comparator prefix on the formatted value', () => {
    const row = measurementToEditableRow(
      asMeasurement({ value: 10, comparator: '<', valueText: '<10' }),
      'k',
    );
    expect(row.valueText).toBe('<10');
  });

  it('keeps a qualitative value exactly as printed, with no unit or range text', () => {
    const row = measurementToEditableRow(
      asMeasurement({
        value: null,
        comparator: null,
        valueText: 'Assente',
        unit: null,
        refMin: null,
        refMax: null,
        refText: null,
      }),
      'k',
    );
    expect(row).toMatchObject({
      valueText: 'Assente',
      unit: '',
      refMinText: '',
      refMaxText: '',
      refText: '',
    });
  });
});
