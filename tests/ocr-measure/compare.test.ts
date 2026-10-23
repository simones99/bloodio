import { describe, expect, it } from 'vitest';
import { buildDraftRow } from '../../src/parsers/draft';
import type { DraftReport, DraftRow, RawRow } from '../../src/parsers/types';
import { compareReports, cutRowOutcomes, isTrustedAt } from '../../tools/ocr-measure/compare';

const raw = (overrides: Partial<RawRow> = {}): RawRow => ({
  name: 'TSH',
  value: '5,07',
  unit: 'µUI/mL',
  ref: 'da 0,27 a 4,20',
  section: 'MONITORAGGIO TIROIDE',
  page: 0,
  bbox: { x: 0, y: 0, w: 10, h: 10 },
  ...overrides,
});

const report = (rows: DraftRow[]): DraftReport => ({
  adapterId: 'test',
  lab: null,
  sampleDate: null,
  type: 'sangue',
  rows,
  warnings: [],
});

const TSH = buildDraftRow(raw());
const FT4 = buildDraftRow(raw({ name: 'FT4', value: '1,56', unit: 'ng/dL', ref: '0,93 - 1,70' }));

describe('compareReports', () => {
  it('finds every row right when the reading equals the truth', () => {
    const result = compareReports(report([TSH, FT4]), report([TSH, FT4]));
    expect(result.rows.map((row) => row.outcome)).toEqual(['giusta', 'giusta']);
    expect(result.extra).toEqual([]);
  });

  it('tells each kind of mistake apart', () => {
    const truth = report([TSH, FT4]);
    expect(compareReports(truth, report([FT4])).rows[0]?.outcome).toBe('mancante');
    expect(
      compareReports(truth, report([buildDraftRow(raw({ value: '5,46' })), FT4])).rows[0]?.outcome,
    ).toBe('valore sbagliato');
    expect(
      compareReports(truth, report([buildDraftRow(raw({ value: '<5,07' })), FT4])).rows[0]?.outcome,
    ).toBe('valore sbagliato');
    expect(
      compareReports(truth, report([buildDraftRow(raw({ unit: 'mUI/L' })), FT4])).rows[0]?.outcome,
    ).toBe('unità sbagliata');
    expect(
      compareReports(truth, report([buildDraftRow(raw({ ref: 'da 0,27 a 4,02' })), FT4])).rows[0]
        ?.outcome,
    ).toBe('range sbagliato');
  });

  it('aligns by name when the entry was read wrong', () => {
    const wrongEntry: DraftRow = {
      ...TSH,
      analyteMatch: { analyteId: 'ft3', suggestionId: null, score: 1 },
    };
    expect(compareReports(report([TSH]), report([wrongEntry])).rows[0]?.outcome).toBe(
      'voce sbagliata',
    );
  });

  it('counts rows read that the truth does not have', () => {
    expect(compareReports(report([TSH]), report([TSH, FT4])).extra).toHaveLength(1);
  });

  it('aligns each row read once', () => {
    const result = compareReports(report([TSH, TSH]), report([TSH]));
    expect(result.rows.map((row) => row.outcome)).toEqual(['giusta', 'mancante']);
  });

  it('carries the unit read, the repair and the OCR data of the row', () => {
    const read: DraftRow = {
      ...buildDraftRow(raw({ unit: 'pUlml' }), { ocr: true }),
      ocr: { confidence: 0.91, trustable: false },
    };
    const [row] = compareReports(report([TSH]), report([read])).rows;
    expect(row).toEqual({
      name: 'TSH',
      outcome: 'giusta',
      expectedUnit: 'µUI/mL',
      readUnit: 'pUlml',
      unitRepaired: true,
      ocrConfidence: 0.91,
      trustable: false,
      flags: ['ocr-unit'],
    });
  });

  it('keeps a trusted row read under the wrong entry as an extra row', () => {
    const fsh: DraftRow = {
      ...buildDraftRow(raw({ name: 'FSH' })),
      ocr: { confidence: 0.99, trustable: true },
    };
    const result = compareReports(report([TSH]), report([fsh]));
    expect(result.rows[0]?.outcome).toBe('mancante');
    expect(result.extra).toHaveLength(1);
    const [extra] = result.extra;
    expect(extra?.analyteId).toBe(fsh.analyteMatch.analyteId);
    expect(isTrustedAt(extra!, 0.9)).toBe(true);
    expect(isTrustedAt(extra!, 0.995)).toBe(false);
    expect(isTrustedAt({ ocrConfidence: null, trustable: true }, 0)).toBe(false);
  });

  it('matches on the same page before other pages', () => {
    const p0 = buildDraftRow(raw({ page: 0 }));
    const p1 = buildDraftRow(raw({ page: 1, value: '3,10' }));
    const result = compareReports(report([p0, p1]), report([p1]));
    expect(result.rows.map((row) => row.outcome)).toEqual(['mancante', 'giusta']);
  });

  it('prefers the read row with the same name among rows of one entry', () => {
    const ft3 = buildDraftRow(raw({ name: 'FT3', value: '3,10', unit: 'pg/mL', ref: '2,0 - 4,4' }));
    const misread: DraftRow = {
      ...TSH,
      analyteMatch: { analyteId: ft3.analyteMatch.analyteId, suggestionId: null, score: 1 },
    };
    const result = compareReports(report([ft3, TSH]), report([misread, ft3]));
    expect(result.rows.map((row) => row.outcome)).toEqual(['giusta', 'voce sbagliata']);
  });

  it('compares text values and unit spellings', () => {
    const negative = buildDraftRow(raw({ value: 'NEGATIVO', ref: 'negativo' }));
    const positive = buildDraftRow(raw({ value: 'POSITIVO', ref: 'negativo' }));
    expect(compareReports(report([negative]), report([positive])).rows[0]?.outcome).toBe(
      'valore sbagliato',
    );
    expect(compareReports(report([negative]), report([negative])).rows[0]?.outcome).toBe('giusta');
    const spelled = buildDraftRow(raw({ unit: 'µUI/ml' }));
    expect(compareReports(report([TSH]), report([spelled])).rows[0]?.outcome).toBe('giusta');
  });

  it('carries the flags of the row read', () => {
    const flagged: DraftRow = { ...TSH, flags: ['unit-mismatch'] };
    expect(compareReports(report([TSH]), report([flagged])).rows[0]?.flags).toEqual([
      'unit-mismatch',
    ]);
  });
});

describe('cutRowOutcomes', () => {
  it('gives a cut row the outcome of the truth row with its page, name and value', () => {
    const neutrophilsShare = buildDraftRow(raw({ name: 'Neutrofili', value: '55,0', unit: '%' }));
    const neutrophilsCount = buildDraftRow(
      raw({ name: 'Neutrofili', value: '3,10', unit: '10^3/µL' }),
    );
    const truth = report([TSH, neutrophilsShare, neutrophilsCount]);
    const read = report([
      TSH,
      neutrophilsShare,
      buildDraftRow(raw({ name: 'Neutrofili', value: '3,70', unit: '10^3/µL' })),
    ]);
    const { rows } = compareReports(truth, read);
    expect(rows.map((row) => row.outcome)).toEqual(['giusta', 'giusta', 'valore sbagliato']);
    // The rows the adapter cut from the same reading: a value read wrong finds no truth row.
    expect(
      cutRowOutcomes(truth, rows, [
        { page: 0, name: 'TSH', value: '5,07' },
        { page: 0, name: ' neutrofili ', value: '55,0' },
        { page: 0, name: 'Neutrofili', value: '3,70' },
        { page: 1, name: 'TSH', value: '5,07' },
      ]),
    ).toEqual(['giusta', 'giusta', null, null]);
  });

  it('lets each truth row answer once', () => {
    const truth = report([TSH]);
    const { rows } = compareReports(truth, truth);
    const cut = { page: 0, name: 'TSH', value: '5,07' };
    expect(cutRowOutcomes(truth, rows, [cut, cut])).toEqual(['giusta', null]);
  });
});
