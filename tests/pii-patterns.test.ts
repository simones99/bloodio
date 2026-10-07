import { describe, expect, it } from 'vitest';
import { findPersonalPatterns } from '../scripts/lib/pii-patterns.mjs';

describe('findPersonalPatterns', () => {
  const clean = [
    'Dott. Nome Cognome',
    'Direttore: Dott.ssa Nome Cognome',
    'Sig.',
    'Dott.',
    'Nato il: 01/01/1980',
    'Nata il 01/01/1980',
    '4.220.000',
    '531.000',
    '1.029',
    '30/08/2021',
    '09:31',
    'da 4.500.000 a 5.500.000',
    'Valori di riferimento',
  ];

  it.each(clean)('is clean: %s', (text) => {
    expect(findPersonalPatterns(text)).toEqual([]);
  });

  it('flags a titled name that is not the placeholder', () => {
    expect(findPersonalPatterns('Dott. Mario Rossi')).toContain('titled-name');
  });

  it('ignores lowercase text after a title', () => {
    expect(findPersonalPatterns('Dott. in medicina di laboratorio')).toEqual([]);
    expect(findPersonalPatterns('Prof. ordinario di patologia clinica')).toEqual([]);
  });

  it('flags names after an upper-case title and upper-case names', () => {
    expect(findPersonalPatterns('DOTT. MARIO ROSSI')).toContain('titled-name');
    expect(findPersonalPatterns('dott.ssa Anna Bianchi')).toContain('titled-name');
  });

  it('flags Dr. and Prof.ssa variants', () => {
    expect(findPersonalPatterns('Dr. Anna Bianchi')).toContain('titled-name');
    expect(findPersonalPatterns('Prof.ssa Laura Verdi')).toContain('titled-name');
  });

  it('flags a birth date other than the placeholder', () => {
    expect(findPersonalPatterns('Nato il: 15/03/1975')).toContain('birth-date');
    expect(findPersonalPatterns('Nata il 15/03/1975')).toContain('birth-date');
  });

  it('flags an Italian tax code', () => {
    expect(findPersonalPatterns('XXXXXX00X00X000X')).toContain('tax-code');
  });

  it('flags phone-shaped runs', () => {
    expect(findPersonalPatterns('T.0123.456789')).toContain('phone');
    expect(findPersonalPatterns('0123 456789')).toContain('phone');
    expect(findPersonalPatterns('+39 333 1234567')).toContain('phone');
  });

  it('does not flag lab values, dates, times or ranges as phone numbers', () => {
    for (const text of [
      '4.220.000',
      '531.000',
      '1.029',
      '30/08/2021',
      '09:31',
      'da 4.500.000 a 5.500.000',
    ]) {
      expect(findPersonalPatterns(text)).not.toContain('phone');
    }
  });
});
