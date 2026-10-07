import { describe, expect, it } from 'vitest';
import { buildDraftReport, buildDraftRow, needsReview } from '../../src/parsers/draft';
import type { RawRow } from '../../src/parsers/types';

const raw = (overrides: Partial<RawRow>): RawRow => ({
  name: 'TSH',
  value: '5,07',
  unit: 'μUI/ml',
  ref: 'da 0,27 a 4,20',
  section: 'MONITORAGGIO TIROIDE',
  page: 0,
  bbox: { x: 0, y: 0, w: 10, h: 10 },
  ...overrides,
});

describe('buildDraftRow', () => {
  it('interprets a clean row with full confidence', () => {
    const row = buildDraftRow(raw({}));
    expect(row.analyteMatch).toEqual({ analyteId: 'tsh', suggestionId: null, score: 1 });
    expect(row.parsed).toEqual({
      value: 5.07,
      comparator: null,
      valueText: '5,07',
      unit: 'µUI/mL',
      refMin: 0.27,
      refMax: 4.2,
      refText: 'da 0,27 a 4,20',
    });
    expect(row.confidence).toBe(1);
    expect(row.flags).toEqual([]);
    expect(needsReview(row)).toBe(false);
  });

  it('keeps the printed text next to the interpretation', () => {
    const row = buildDraftRow(raw({}));
    expect(row).toMatchObject({
      rawName: 'TSH',
      rawValue: '5,07',
      rawUnit: 'μUI/ml',
      rawRef: 'da 0,27 a 4,20',
    });
  });

  it('flags an unknown analyte with zero confidence', () => {
    const row = buildDraftRow(
      raw({ name: 'Ricerca sangue occulto', value: 'Negativo', unit: '', ref: '' }),
    );
    expect(row.analyteMatch.analyteId).toBeNull();
    expect(row.flags).toEqual(['unknown-analyte']);
    expect(row.confidence).toBe(0);
  });

  it('flags a suggestion and never applies it', () => {
    const row = buildDraftRow(
      raw({ name: 'Transaminasi AST', value: '27', unit: 'mU/ml', ref: 'da 10 a 50' }),
    );
    expect(row.analyteMatch).toMatchObject({ analyteId: null, suggestionId: 'ast' });
    expect(row.flags).toEqual(['suggested-analyte']);
    expect(needsReview(row)).toBe(true);
  });

  it('flags a unit the analyte cannot convert', () => {
    const row = buildDraftRow(raw({ unit: 'ng/ml' }));
    expect(row.flags).toEqual(['unit-mismatch']);
  });

  it('flags an ambiguous number when the analyte is unknown', () => {
    const row = buildDraftRow(raw({ name: 'Analita ignoto', value: '1.250', unit: '', ref: '' }));
    expect(row.parsed.value).toBe(1250);
    expect(row.flags).toEqual(['unknown-analyte', 'ambiguous-number']);
  });

  it('lowers confidence when a numeric analyte has a text value', () => {
    const row = buildDraftRow(raw({ value: 'in corso' }));
    expect(row.parsed.value).toBeNull();
    expect(row.confidence).toBe(0.5);
  });

  it('lowers confidence when a numeric reference cannot be read', () => {
    const row = buildDraftRow(raw({ ref: 'vedi allegato' }));
    expect(row.parsed).toMatchObject({ refMin: null, refMax: null, refText: 'vedi allegato' });
    expect(row.confidence).toBe(0.7);
  });

  it('caps confidence and flags weak OCR', () => {
    expect(buildDraftRow(raw({}), { maxConfidence: 0.5 }).confidence).toBe(0.5);
    const ocr = buildDraftRow(raw({}), { ocrConfidence: 0.6 });
    expect(ocr.confidence).toBe(0.6);
    expect(ocr.flags).toEqual(['low-ocr']);
  });
});

describe('buildDraftReport', () => {
  it('infers the report type from its rows', () => {
    const report = buildDraftReport({
      adapterId: 'proavis',
      lab: 'PROAVIS',
      sampleDate: '2021-10-04',
      source: 'pdf-text',
      rawRows: [
        raw({}),
        raw({
          name: 'Nitriti',
          value: 'Assenti',
          unit: '',
          ref: 'Assente',
          section: 'ESAME CHIMICO FISICO URINE',
        }),
      ],
    });
    expect(report.type).toBe('misto');
    expect(report.warnings).toEqual([]);
  });

  it('warns about missing rows and date', () => {
    const report = buildDraftReport({
      adapterId: 'generic',
      lab: null,
      sampleDate: null,
      source: 'ocr',
      rawRows: [],
    });
    expect(report.type).toBe('altro');
    expect(report.warnings).toEqual(['no-rows', 'no-date']);
  });
});
