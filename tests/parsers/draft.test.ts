import { describe, expect, it } from 'vitest';
import {
  buildDraftReport,
  buildDraftRow,
  needsReview,
  OCR_MAX_CONFIDENCE,
} from '../../src/parsers/draft';
import { getAnalyte } from '../../src/domain/catalog';
import { toCanonicalFactor } from '../../src/domain/units';
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

  it('reads a CPK far above its range as thousands and asks', () => {
    const row = buildDraftRow(
      raw({ name: 'CPK', value: '25.000', unit: 'U/L', ref: '0 - 190', section: null }),
    );
    expect(row.analyteMatch.analyteId).toBe('cpk');
    expect(row.parsed).toMatchObject({ value: 25000, refMin: 0, refMax: 190 });
    expect(row.flags).toEqual(['ambiguous-number']);
    expect(needsReview(row)).toBe(true);
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

  it('caps confidence', () => {
    expect(buildDraftRow(raw({}), { maxConfidence: 0.5 }).confidence).toBe(0.5);
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

describe('buildDraftReport — rows read by OCR', () => {
  const report = (source: 'ocr' | 'pdf-text', rawRows: RawRow[], maxConfidence?: number) =>
    buildDraftReport({
      adapterId: 'proavis',
      lab: 'PROAVIS',
      sampleDate: '2021-07-10',
      source,
      rawRows,
      options: maxConfidence === undefined ? undefined : { maxConfidence },
    });

  it('repairs the units of OCR rows only', () => {
    expect(report('ocr', [raw({ unit: 'pUlml' })]).rows[0]?.flags).toEqual(['ocr-unit', 'low-ocr']);
    expect(report('pdf-text', [raw({ unit: 'pUlml' })]).rows[0]?.flags).toEqual(['unit-mismatch']);
  });

  it('sends every OCR row to review, however clean', () => {
    const [row] = report('ocr', [raw({})]).rows;
    expect(row?.flags).toEqual(['low-ocr']);
    expect(row?.confidence).toBe(OCR_MAX_CONFIDENCE);
    expect(needsReview(row!)).toBe(true);
  });

  it('keeps the other flags and a lower confidence', () => {
    const [row] = report('ocr', [raw({ name: 'Voce che non esiste' })]).rows;
    expect(row?.flags).toContain('unknown-analyte');
    expect(row?.flags).toContain('low-ocr');
    expect(row?.confidence).toBe(0);
  });

  it('keeps a confidence already below the cap, with one flag', () => {
    const [row] = report('ocr', [raw({})], 0.5).rows;
    expect(row?.flags.filter((flag) => flag === 'low-ocr')).toHaveLength(1);
    expect(row?.confidence).toBe(0.5);
  });

  it('leaves rows from a PDF text layer as they are', () => {
    const [row] = report('pdf-text', [raw({})]).rows;
    expect(row?.flags).toEqual([]);
    expect(row?.confidence).toBe(1);
  });
});

describe('buildDraftRow — units read by OCR', () => {
  it('repairs a mangled unit to the one unit of the entry with its shape', () => {
    const row = buildDraftRow(raw({ unit: 'pUlml' }), { ocr: true });
    expect(row.rawUnit).toBe('pUlml');
    expect(row.parsed.unit).toBe('µUI/mL');
    expect(row.flags).toEqual(['ocr-unit']);
  });

  it('converts the value with the repaired unit', () => {
    const row = buildDraftRow(
      raw({ name: 'Glicemia', value: '5,2', unit: 'mmoI/L', ref: '3,9 - 6,1', section: null }),
      { ocr: true },
    );
    expect(row.parsed.unit).toBe('mmol/L');
    expect(toCanonicalFactor(getAnalyte('glucose')!, row.parsed.unit)).toBe(18.016);
    expect(row.flags).toEqual(['ocr-unit']);
  });

  it('repairs the unit before reading the dots', () => {
    const row = buildDraftRow(
      raw({ name: 'Glicemia', value: '5.200', unit: 'mmoI/L', ref: '', section: null }),
      { ocr: true },
    );
    expect(row.parsed.value).toBe(5.2);
    expect(row.parsed.unit).toBe('mmol/L');
    expect(row.flags).toEqual(['ocr-unit']);
  });

  it('never turns a real unit into another one', () => {
    // "pmol/l" has the shape of µmol/L: a factor of a million if it were repaired.
    const row = buildDraftRow(
      raw({ name: 'Creatinina', value: '80', unit: 'pmol/l', ref: '', section: null }),
      { ocr: true },
    );
    expect(row.parsed.unit).toBe('pmol/L');
    expect(row.flags).toEqual(['unit-mismatch']);
  });

  it('leaves the units of a PDF text layer alone', () => {
    const row = buildDraftRow(raw({ unit: 'pUlml' }));
    expect(row.parsed.unit).toBe('pUlml');
    expect(row.flags).toEqual(['unit-mismatch']);
  });
});
