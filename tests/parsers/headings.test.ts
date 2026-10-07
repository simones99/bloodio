import { describe, expect, it } from 'vitest';
import { keepEmptyValueAsRow } from '../../src/parsers/headings';

describe('keepEmptyValueAsRow', () => {
  it('keeps a catalog analyte with no value as a row to review', () => {
    expect(keepEmptyValueAsRow('TSH', 'MONITORAGGIO TIROIDE')).toBe(true);
    expect(keepEmptyValueAsRow('Emoglobina', null)).toBe(true);
  });

  it('treats an unknown or fuzzy name as a section heading', () => {
    expect(keepEmptyValueAsRow('EMATOLOGIA', null)).toBe(false);
    expect(keepEmptyValueAsRow('FORMULA LEUCOCITARIA', null)).toBe(false);
    expect(keepEmptyValueAsRow('ESAME DEL SEDIMENTO', null)).toBe(false);
  });
});
