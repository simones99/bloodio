import { describe, expect, it } from 'vitest';
import { CATALOG } from '../../src/domain/catalog';
import type { Analyte } from '../../src/domain/types';
import {
  convert,
  isKnownUnit,
  KNOWN_UNITS,
  normalizeUnit,
  repairOcrUnit,
  toCanonicalFactor,
  unitShape,
  unitsOf,
} from '../../src/domain/units';

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

describe('isKnownUnit', () => {
  it('knows the spellings normalizeUnit maps', () => {
    expect(isKnownUnit('mg/dl')).toBe(true);
    expect(isKnownUnit('μUI/ml')).toBe(true);
    expect(isKnownUnit('pmol/l')).toBe(true);
  });

  it('does not know what OCR makes of them', () => {
    expect(isKnownUnit('pUlml')).toBe(false);
    expect(isKnownUnit('ng/di')).toBe(false);
  });
});

describe('unitShape', () => {
  it('drops what OCR loses and folds the letters it confuses', () => {
    expect(unitShape('pUlml')).toBe('uulml');
    expect(unitShape('µUI/mL')).toBe('uulml');
    expect(unitShape('10^3/µL')).toBe('lo3ul');
    expect(unitShape('rnmol/L')).toBe('mmoll');
  });
});

describe('repairOcrUnit', () => {
  it('returns the one unit of the entry with the same shape', () => {
    expect(repairOcrUnit('pUlml', ['µUI/mL', 'mUI/L'])).toBe('µUI/mL');
    expect(repairOcrUnit('mUl/l', ['µUI/mL', 'mUI/L'])).toBe('mUI/L');
    expect(repairOcrUnit('ng/di', ['ng/dL', 'pg/mL', 'pmol/L'])).toBe('ng/dL');
  });

  it('refuses when no unit or more than one unit has that shape', () => {
    expect(repairOcrUnit('xyz', ['µUI/mL', 'mUI/L'])).toBeNull();
    expect(repairOcrUnit('ug/ml', ['pg/mL', 'µg/mL'])).toBeNull();
    expect(repairOcrUnit('', ['mg/dL'])).toBeNull();
  });

  it('repairs the garbled units of the proavis fixture', () => {
    expect(repairOcrUnit('Ul/ml', ['UI/mL', 'mUI/mL'])).toBe('UI/mL');
    expect(repairOcrUnit('ulmi', ['UI/mL', 'mUI/mL'])).toBe('UI/mL');
    expect(repairOcrUnit('ui', ['U/L', 'mUI/L'])).toBe('U/L');
    expect(repairOcrUnit('mmoI/L', ['mg/dL', 'mmol/L'])).toBe('mmol/L');
  });
});

describe('repairOcrUnit safety', () => {
  it('never reshapes a known spelling', () => {
    expect(repairOcrUnit('pmol/l', ['mg/dL', 'µmol/L'])).toBeNull();
    expect(repairOcrUnit('µg/mL', ['pg/mL'])).toBeNull();
  });

  it('keeps SI prefixes apart', () => {
    expect(repairOcrUnit('mUI/mL', ['µUI/mL'])).toBeNull();
    expect(repairOcrUnit('nmol/L', ['µmol/L'])).toBeNull();
    expect(repairOcrUnit('mol/L', ['mmol/L'])).toBeNull();
  });

  it('folds y, | and 0', () => {
    expect(repairOcrUnit('yg/dl', ['µg/dL', 'mg/dL'])).toBe('µg/dL');
    expect(repairOcrUnit('mmo|/L', ['mmol/L', 'mg/dL'])).toBe('mmol/L');
    expect(repairOcrUnit('mmo0l/L', ['mmol/L', 'mg/dL'])).toBeNull();
    expect(repairOcrUnit('mm0l/L', ['mmol/L', 'mg/dL'])).toBe('mmol/L');
  });

  it('never confuses a real unit with another unit of any numeric entry', () => {
    for (const entry of CATALOG) {
      if (entry.kind !== 'numeric') continue;
      const own = unitsOf(entry);
      for (const unit of KNOWN_UNITS) {
        if (own.includes(unit)) continue;
        expect(repairOcrUnit(unit, own), `${entry.id} / ${unit}`).toBeNull();
      }
    }
  });
});
