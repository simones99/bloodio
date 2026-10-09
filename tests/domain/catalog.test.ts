import { describe, expect, it } from 'vitest';
import { CATALOG, getAnalyte } from '../../src/domain/catalog';
import { normalizeName } from '../../src/domain/normalize';
import { normalizeUnit, unitsOf } from '../../src/domain/units';

describe('catalog integrity', () => {
  it('has about 110 analytes with unique ids', () => {
    expect(CATALOG.length).toBeGreaterThanOrEqual(100);
    expect(new Set(CATALOG.map((a) => a.id)).size).toBe(CATALOG.length);
  });

  it('exposes analytes by id', () => {
    expect(getAnalyte('tsh')?.name).toBe('TSH');
    expect(getAnalyte('nope')).toBeUndefined();
  });

  it('writes every unit in its normalized spelling', () => {
    for (const analyte of CATALOG) {
      for (const unit of unitsOf(analyte))
        expect(normalizeUnit(unit), `${analyte.id} ${unit}`).toBe(unit);
    }
  });

  it('uses positive finite conversion factors', () => {
    for (const analyte of CATALOG) {
      for (const u of analyte.units ?? []) {
        expect(Number.isFinite(u.toCanonical) && u.toCanonical > 0, `${analyte.id} ${u.unit}`).toBe(
          true,
        );
      }
    }
  });

  it('gives every analyte at least one alias and qualitative analytes no unit', () => {
    for (const analyte of CATALOG) {
      expect(analyte.aliases.length, analyte.id).toBeGreaterThan(0);
      if (analyte.kind === 'qualitative') expect(analyte.canonicalUnit, analyte.id).toBeUndefined();
    }
  });

  it('never shares an alias between analytes that specimen and unit cannot tell apart', () => {
    const owners = new Map<string, (typeof CATALOG)[number][]>();
    for (const analyte of CATALOG) {
      for (const alias of new Set(analyte.aliases.map(normalizeName))) {
        owners.set(alias, [...(owners.get(alias) ?? []), analyte]);
      }
    }
    for (const [alias, analytes] of owners) {
      for (let i = 0; i < analytes.length; i++) {
        for (let j = i + 1; j < analytes.length; j++) {
          const a = analytes[i]!;
          const b = analytes[j]!;
          if (a.specimen !== b.specimen) continue;
          const unitsA = new Set(unitsOf(a));
          const overlap = unitsOf(b).some((u) => unitsA.has(u));
          const bothUnitless = unitsA.size === 0 && unitsOf(b).length === 0;
          expect(overlap || bothUnitless, `"${alias}" is shared by ${a.id} and ${b.id}`).toBe(
            false,
          );
        }
      }
    }
  });

  it('knows the conversion reference points', () => {
    const factor = (id: string, unit: string) =>
      getAnalyte(id)!.units!.find((u) => u.unit === unit)!.toCanonical;
    expect(5 * factor('glucose', 'mmol/L')).toBeCloseTo(90.1, 1); // 5 mmol/L ≈ 90 mg/dL
    expect(5 * factor('total-cholesterol', 'mmol/L')).toBeCloseTo(193.4, 1); // 5 mmol/L ≈ 193 mg/dL
    expect(100 * factor('creatinine', 'µmol/L')).toBeCloseTo(1.13, 2); // 100 µmol/L ≈ 1.13 mg/dL
    expect(7.1 * factor('ft4', 'pg/mL')).toBeCloseTo(0.71, 5); // 7.1 pg/mL = 0.71 ng/dL
    expect(15 * factor('ft4', 'pmol/L')).toBeCloseTo(1.17, 2); // 15 pmol/L ≈ 1.17 ng/dL
    expect(75 * factor('vitamin-d', 'nmol/L')).toBeCloseTo(30, 0); // 75 nmol/L ≈ 30 ng/mL
    expect(7.51 * factor('wbc', '10^3/µL')).toBeCloseTo(7510, 5);
  });

  it('keeps the plausible ranges that choose how to read dots (spec 2026-10-21 §4)', () => {
    const plausible = Object.fromEntries(
      CATALOG.filter((a) => a.plausible).map((a) => [a.id, a.plausible]),
    );
    expect(plausible).toMatchObject({
      rbc: { min: 1e4, max: 1e7 },
      hemoglobin: { min: 0.1, max: 26 },
      hematocrit: { min: 0.1, max: 75 },
      rdw: { min: 8, max: 40 },
      platelets: { min: 2000, max: 5000000 },
      mpv: { min: 4, max: 25 },
      wbc: { min: 30, max: 440000 },
      'neutrophils-abs': { min: 0, max: 440000 },
      'lymphocytes-abs': { min: 0, max: 440000 },
      'monocytes-abs': { min: 0, max: 440000 },
      'eosinophils-abs': { min: 0, max: 440000 },
      'basophils-abs': { min: 0, max: 440000 },
      glucose: { min: 2, max: 1500 },
      hba1c: { min: 3, max: 24.8 },
      'vitamin-b12': { min: 50, max: 7500 },
    });
  });

  it('declares an SI unit the analyte can be shown in', () => {
    for (const analyte of CATALOG) {
      if (analyte.siUnit === undefined) continue;
      expect(unitsOf(analyte), analyte.id).toContain(analyte.siUnit);
    }
  });

  it('declares the SI unit of every analyte with alternative units, except eGFR', () => {
    const missing = CATALOG.filter((a) => (a.units?.length ?? 0) > 0 && a.siUnit === undefined);
    expect(missing.map((a) => a.id)).toEqual(['egfr']);
  });

  it('knows the SI unit of the common pairs', () => {
    expect(getAnalyte('glucose')!.siUnit).toBe('mmol/L');
    expect(getAnalyte('total-cholesterol')!.siUnit).toBe('mmol/L');
    expect(getAnalyte('creatinine')!.siUnit).toBe('µmol/L');
    expect(getAnalyte('hemoglobin')!.siUnit).toBe('g/L');
    expect(getAnalyte('wbc')!.siUnit).toBe('10^9/L');
    expect(getAnalyte('rbc')!.siUnit).toBe('10^12/L');
    expect(getAnalyte('tsh')!.siUnit).toBe('mUI/L');
  });
});
