import { describe, expect, it } from 'vitest';
import { CATALOG } from '../../src/domain/catalog';
import { REPORTABLE } from '../../src/domain/catalog/reportable';

/** Numeric entries without a verifiable source (spec 2026-10-16 §6.6.4). */
const WITHOUT_SOURCE = ['ag-ratio', 'mch', 'mchc', 'zinc'];

describe('reportable ranges', () => {
  it('cover every numeric entry but the four without a source', () => {
    const missing = CATALOG.filter((a) => a.kind === 'numeric' && a.reportable === undefined)
      .map((a) => a.id)
      .sort();
    expect(missing).toEqual(WITHOUT_SOURCE);
  });

  it('belong only to numeric entries of the catalog', () => {
    const numeric = new Set(CATALOG.filter((a) => a.kind === 'numeric').map((a) => a.id));
    for (const id of Object.keys(REPORTABLE)) expect(numeric.has(id), id).toBe(true);
  });

  it('have finite bounds, a non-negative minimum and a minimum below the maximum', () => {
    for (const [id, range] of Object.entries(REPORTABLE)) {
      expect(Number.isFinite(range.min), id).toBe(true);
      expect(Number.isFinite(range.max), id).toBe(true);
      expect(range.min >= 0, id).toBe(true);
      expect(range.min < range.max, id).toBe(true);
    }
  });

  it('lie inside the plausible range of their entry, so a dot is never read against a real value', () => {
    for (const a of CATALOG) {
      if (!a.plausible || !a.reportable) continue;
      expect(a.plausible.min <= a.reportable.min, `${a.id} min`).toBe(true);
      expect(a.plausible.max >= a.reportable.max, `${a.id} max`).toBe(true);
    }
  });

  it('keep the plausible ranges that choose how to read dots (spec 2026-10-21 §4)', () => {
    const plausible = Object.fromEntries(
      CATALOG.filter((a) => a.plausible).map((a) => [a.id, a.plausible]),
    );
    expect(plausible).toEqual({
      rbc: { min: 1e4, max: 1e7 },
      hemoglobin: { min: 0.1, max: 26 },
      hematocrit: { min: 0.1, max: 75 },
      mcv: { min: 50, max: 150 },
      mch: { min: 15, max: 45 },
      mchc: { min: 25, max: 40 },
      rdw: { min: 8, max: 40 },
      platelets: { min: 2000, max: 5000000 },
      mpv: { min: 4, max: 25 },
      wbc: { min: 30, max: 440000 },
      'neutrophils-pct': { min: 0, max: 100 },
      'lymphocytes-pct': { min: 0, max: 100 },
      'monocytes-pct': { min: 0, max: 100 },
      'eosinophils-pct': { min: 0, max: 100 },
      'basophils-pct': { min: 0, max: 100 },
      'reticulocytes-pct': { min: 0, max: 100 },
      'neutrophils-abs': { min: 0, max: 440000 },
      'lymphocytes-abs': { min: 0, max: 440000 },
      'monocytes-abs': { min: 0, max: 440000 },
      'eosinophils-abs': { min: 0, max: 440000 },
      'basophils-abs': { min: 0, max: 440000 },
      glucose: { min: 2, max: 1500 },
      hba1c: { min: 3, max: 24.8 },
      ast: { min: 0, max: 100000 },
      alt: { min: 0, max: 100000 },
      ggt: { min: 0, max: 100000 },
      alp: { min: 0, max: 100000 },
      ldh: { min: 0, max: 100000 },
      'transferrin-saturation': { min: 0, max: 100 },
      'vitamin-b12': { min: 50, max: 7500 },
      'd-dimer': { min: 10, max: 100000 },
      'albumin-pct': { min: 0, max: 100 },
      'alpha1-pct': { min: 0, max: 100 },
      'alpha2-pct': { min: 0, max: 100 },
      'beta1-pct': { min: 0, max: 100 },
      'beta2-pct': { min: 0, max: 100 },
      'gamma-pct': { min: 0, max: 100 },
      cpk: { min: 0, max: 100000 },
      amylase: { min: 0, max: 100000 },
      lipase: { min: 0, max: 100000 },
      'urine-ph': { min: 4, max: 9.5 },
      'urine-specific-gravity': { min: 1, max: 1.06 },
    });
  });
});
