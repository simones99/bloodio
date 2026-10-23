import { describe, expect, it } from 'vitest';
import { needsReview } from '../../src/parsers/draft';
import { parseReport } from '../../src/parsers/registry';
import { loadOcrFixture } from '../fixtures/load';

describe('OCR of the synthetic PROAVIS scan', () => {
  const report = parseReport(loadOcrFixture('proavis-2021-07-10'));

  it('is recognised as PROAVIS, with its date', () => {
    expect(report).toMatchObject({
      adapterId: 'proavis',
      lab: 'PROAVIS',
      sampleDate: '2021-07-10',
    });
  });

  it('finds the six rows with their values and ranges', () => {
    expect(report.rows.map((row) => row.rawName)).toEqual([
      'HTG',
      'TSH',
      'FT4',
      'Ab-anti Perossidasi (Ab-TPO)',
      'Ab-anti recettore del TSH',
      'Ab-anti Tireoglobulina (Ab-HTG)',
    ]);
    expect(report.rows.map((row) => row.parsed.value)).toEqual([
      52.4, 2.34, 1.56, 27.81, 0.49, 212.5,
    ]);
    expect(report.rows.map((row) => row.parsed.refMax)).toEqual([77, 4.2, 1.7, 34, 1.75, 115]);
  });

  it('sends every row to review', () => {
    for (const row of report.rows) {
      expect(row.flags).toContain('low-ocr');
      expect(needsReview(row)).toBe(true);
    }
  });

  it('repairs the five units the OCR mangled', () => {
    expect(report.rows.map((row) => row.rawUnit)).toEqual([
      'ng/ml',
      'pUlml',
      'ng/di',
      'Ul/ml',
      'ui',
      'ulmi',
    ]);
    expect(report.rows.map((row) => row.parsed.unit)).toEqual([
      'ng/mL',
      'µUI/mL',
      'ng/dL',
      'UI/mL',
      'U/L',
      'UI/mL',
    ]);
    expect(report.rows.filter((row) => row.flags.includes('ocr-unit'))).toHaveLength(5);
    expect(report.rows.some((row) => row.flags.includes('unit-mismatch'))).toBe(false);
  });
});
