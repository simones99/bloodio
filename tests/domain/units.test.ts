import { describe, expect, it } from 'vitest';
import type { Analyte } from '../../src/domain/types';
import { convert, normalizeUnit, toCanonicalFactor, unitsOf } from '../../src/domain/units';

const glucose: Analyte = {
  id: 'glucose',
  name: 'Glicemia',
  aliases: ['glicemia'],
  category: 'glicemia',
  specimen: 'blood',
  kind: 'numeric',
  canonicalUnit: 'mg/dL',
  units: [{ unit: 'mmol/L', toCanonical: 18.016 }],
};

const ph: Analyte = {
  id: 'urine-ph',
  name: 'pH urinario',
  aliases: ['ph'],
  category: 'urine',
  specimen: 'urine',
  kind: 'numeric',
};

describe('normalizeUnit', () => {
  it.each([
    ['/μl', '/µL'], // Greek mu, as printed by PROAVIS
    ['/µl', '/µL'], // micro sign
    ['g/dl', 'g/dL'],
    ['gr/dl', 'g/dL'],
    ['fl', 'fL'],
    ['pg', 'pg'],
    ['%', '%'],
    ['μg/dl', 'µg/dL'],
    ['mcg/dl', 'µg/dL'],
    ['mg/dl', 'mg/dL'],
    ['ng/ml', 'ng/mL'],
    ['ng/dl', 'ng/dL'],
    ['pg/ml', 'pg/mL'],
    ['mU/ml', 'U/L'],
    ['U/l', 'U/L'],
    ['UI/ml', 'UI/mL'],
    ['μUI/ml', 'µUI/mL'],
    ['micro U.I./ml', 'µUI/mL'],
    ['mm/1h', 'mm/h'],
    ['Leuc/μl', 'Leuc/µL'],
  ])('%j -> %j', (raw, expected) => {
    expect(normalizeUnit(raw)).toBe(expected);
  });

  it('returns unknown units trimmed', () => {
    expect(normalizeUnit('  copie/ml ')).toBe('copie/ml');
  });
});

describe('conversion', () => {
  it('lists canonical unit first', () => {
    expect(unitsOf(glucose)).toEqual(['mg/dL', 'mmol/L']);
    expect(unitsOf(ph)).toEqual([]);
  });

  it('converts both ways and round-trips', () => {
    expect(convert(glucose, 5, 'mmol/L', 'mg/dL')).toBeCloseTo(90.08, 2);
    expect(convert(glucose, 90.08, 'mg/dl', 'mmol/l')).toBeCloseTo(5, 3);
    const there = convert(glucose, 95, 'mg/dL', 'mmol/L')!;
    expect(convert(glucose, there, 'mmol/L', 'mg/dL')).toBeCloseTo(95, 10);
  });

  it('returns null for a unit the analyte does not know', () => {
    expect(convert(glucose, 5, 'g/L', 'mg/dL')).toBeNull();
    expect(toCanonicalFactor(glucose, 'g/L')).toBeNull();
  });

  it('gives factor 1 to unitless analytes printed without unit', () => {
    expect(toCanonicalFactor(ph, null)).toBe(1);
    expect(toCanonicalFactor(glucose, null)).toBeNull();
    expect(toCanonicalFactor(glucose, 'mmol/l')).toBe(18.016);
  });
});
