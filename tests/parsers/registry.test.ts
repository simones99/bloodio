import { describe, expect, it } from 'vitest';
import { needsReview } from '../../src/parsers/draft';
import { GENERIC_MAX_CONFIDENCE } from '../../src/parsers/generic';
import { detectAdapter, parseReport } from '../../src/parsers/registry';
import type { DraftReport, PositionedText } from '../../src/parsers/types';
import { loadFixture } from '../fixtures/load';

const find = (report: DraftReport, rawName: string, section?: string) => {
  const row = report.rows.find(
    (r) => r.rawName === rawName && (section === undefined || r.section === section),
  );
  if (!row) throw new Error(`row not found: ${rawName}`);
  return row;
};

describe('registry', () => {
  it('picks the adapter of each lab', () => {
    expect(detectAdapter(loadFixture('proavis-2022-08-20')).id).toBe('proavis');
    expect(detectAdapter(loadFixture('ast-2021-08-30')).id).toBe('ast');
  });
  it('falls back to the generic adapter for unknown layouts', () => {
    const unknown: PositionedText = {
      source: 'pdf-text',
      pages: [{ width: 600, height: 800, items: [] }],
    };
    expect(detectAdapter(unknown).id).toBe('generic');
  });
});

describe('parseReport: PROAVIS 20/08/2022', () => {
  const report = parseReport(loadFixture('proavis-2022-08-20'));

  it('fills the report header', () => {
    expect(report).toMatchObject({
      adapterId: 'proavis',
      lab: 'PROAVIS',
      sampleDate: '2022-08-20',
      type: 'sangue',
      warnings: [],
    });
    expect(report.rows).toHaveLength(25);
  });
  it('recognises every analyte with full confidence and nothing to review', () => {
    for (const row of report.rows) {
      expect(row.analyteMatch.analyteId, row.rawName).not.toBeNull();
      expect(row.confidence, row.rawName).toBe(1);
      expect(needsReview(row), row.rawName).toBe(false);
    }
  });
  it('reads thousands separators using the analyte plausibility', () => {
    expect(find(report, 'Globuli rossi').parsed).toMatchObject({
      value: 4220000,
      unit: '/µL',
      refMin: 4500000,
      refMax: 5500000,
    });
    expect(find(report, 'Globuli bianchi').parsed).toMatchObject({
      value: 7510,
      unit: '/µL',
      refMin: 4000,
      refMax: 10000,
    });
    expect(find(report, 'LINFOCITI').parsed).toMatchObject({
      value: 2410,
      unit: '/µL',
      refMin: 1000,
      refMax: 4000,
    });
  });
  it('tells percentage from absolute counts', () => {
    expect(find(report, 'Neutrofili').analyteMatch.analyteId).toBe('neutrophils-pct');
    expect(find(report, 'NEUTROFILI').analyteMatch.analyteId).toBe('neutrophils-abs');
  });
  it('keeps the comparator of "<10"', () => {
    expect(find(report, 'Anticorpi anti Tireoperossidasi').parsed).toMatchObject({
      value: 10,
      comparator: '<',
      valueText: '<10',
      refMin: null,
      refMax: 20,
      unit: 'UI/mL',
    });
  });
});

describe('parseReport: mis-columned value (OCR loses the number)', () => {
  it('warns with empty-value-rows and flags that row for review', () => {
    const fixture = loadFixture('proavis-2022-08-20');
    const withoutTshValue: PositionedText = {
      ...fixture,
      pages: fixture.pages.map((page) => ({
        ...page,
        items: page.items.filter((i) => i.text.trim() !== '5,07'),
      })),
    };
    const report = parseReport(withoutTshValue);
    expect(report.warnings).toContain('empty-value-rows');
    const tsh = find(report, 'TSH');
    expect(tsh.rawValue).toBe('');
    expect(needsReview(tsh)).toBe(true);
  });
});

describe('parseReport: PROAVIS 04/10/2021 (blood and urine)', () => {
  const report = parseReport(loadFixture('proavis-2021-10-04'));

  it('is a mixed report with 49 rows, all recognised', () => {
    expect(report.type).toBe('misto');
    expect(report.rows).toHaveLength(49);
    expect(report.rows.filter((r) => r.analyteMatch.analyteId === null)).toEqual([]);
  });
  it('reads urine specific gravity as a decimal without asking', () => {
    const row = find(report, 'Peso specifico');
    expect(row.parsed).toMatchObject({ value: 1.029, refMin: 1.007, refMax: 1.035, unit: null });
    expect(row.flags).toEqual([]);
  });
  it('asks to confirm the limit derived from the descriptive vitamin D reference', () => {
    const row = find(report, 'Vitamina D (25 OH)');
    expect(row.parsed).toMatchObject({ value: 65.8, refMin: 30, refMax: null });
    expect(row.flags).toEqual(['derived-ref']);
    expect(needsReview(row)).toBe(true);
  });
  it('maps homonyms by section', () => {
    expect(find(report, 'Emoglobina', 'EMOCROMO').analyteMatch.analyteId).toBe('hemoglobin');
    expect(find(report, 'Emoglobina', 'ESAME CHIMICO FISICO URINE').analyteMatch.analyteId).toBe(
      'urine-hemoglobin',
    );
    expect(find(report, 'Glucosio').analyteMatch.analyteId).toBe('urine-glucose');
    expect(find(report, 'Glicemia').analyteMatch.analyteId).toBe('glucose');
  });
  it('keeps qualitative values as text', () => {
    expect(find(report, 'Colore').parsed).toMatchObject({
      value: null,
      valueText: 'Giallo ambrato',
      refText: null,
    });
    expect(find(report, 'Proteine').parsed).toMatchObject({
      value: null,
      valueText: 'Assente',
      refMax: 20,
    });
  });
  it('leaves only the vitamin D row to review', () => {
    expect(report.rows.filter(needsReview).map((r) => r.rawName)).toEqual(['Vitamina D (25 OH)']);
  });
});

describe('parseReport: AST Vallerosa 30/08/2021', () => {
  const report = parseReport(loadFixture('ast-2021-08-30'));

  it('fills the report header', () => {
    expect(report).toMatchObject({
      adapterId: 'ast',
      lab: 'AST Vallerosa',
      sampleDate: '2021-08-30',
      type: 'sangue',
    });
  });
  it('uses the adult band and asks to confirm it', () => {
    const tsh = find(report, 'TSH');
    expect(tsh.analyteMatch.analyteId).toBe('tsh');
    expect(tsh.parsed).toMatchObject({ value: 4.3, unit: 'µUI/mL', refMin: 0.25, refMax: 4 });
    expect(tsh.flags).toEqual(['age-stratified-ref']);
    const ft4 = find(report, 'FT4');
    expect(ft4.parsed).toMatchObject({ value: 7.1, unit: 'pg/mL', refMin: 5.4, refMax: 12.6 });
    expect(ft4.flags).toEqual(['age-stratified-ref']);
  });
});

describe('parseReport: unknown layout through the generic adapter', () => {
  const item = (text: string, x: number, y: number) => ({ text, x, y, w: text.length * 5, h: 10 });
  const unknown: PositionedText = {
    source: 'pdf-text',
    pages: [
      {
        width: 600,
        height: 800,
        items: [
          item('Laboratorio Esempio', 40, 40),
          item('Nato il 01/01/1980', 40, 60),
          item('Data prelievo 03/02/2026', 40, 80),
          item('Glicemia', 40, 200),
          item('92', 250, 200),
          item('mg/dl', 300, 200),
          item('70 - 110', 380, 200),
          item('Analita Sconosciuto', 40, 220),
          item('<5', 250, 220),
          item('Note finali senza numeri', 40, 300),
        ],
      },
    ],
  };
  const report = parseReport(unknown);

  it('extracts name, value, unit and reference from plain lines', () => {
    expect(report.adapterId).toBe('generic');
    expect(report.lab).toBeNull();
    expect(report.sampleDate).toBe('2026-02-03');
    expect(report.rows.map((r) => r.rawName)).toEqual(['Glicemia', 'Analita Sconosciuto']);
    expect(report.rows[0]?.parsed).toMatchObject({
      value: 92,
      unit: 'mg/dL',
      refMin: 70,
      refMax: 110,
    });
    expect(report.rows[1]?.parsed).toMatchObject({ value: 5, comparator: '<' });
  });
  it('marks every row for review', () => {
    for (const row of report.rows) {
      expect(row.confidence).toBeLessThanOrEqual(GENERIC_MAX_CONFIDENCE);
      expect(needsReview(row)).toBe(true);
    }
    expect(report.rows[1]?.flags).toContain('unknown-analyte');
  });
  it('warns when nothing can be read', () => {
    const empty = parseReport({
      source: 'pdf-text',
      pages: [{ width: 600, height: 800, items: [] }],
    });
    expect(empty.rows).toEqual([]);
    expect(empty.warnings).toEqual(['no-rows', 'no-date']);
  });
});
