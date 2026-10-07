import type { Analyte } from './types';

/** Lower-cased, space-less, dot-less spelling -> canonical spelling. Data, not logic. */
const SPELLINGS: Record<string, string> = {
  '%': '%',
  '/µl': '/µL',
  '/mm3': '/µL',
  '/mmc': '/µL',
  '10^3/µl': '10^3/µL',
  'x10^3/µl': '10^3/µL',
  'migl/µl': '10^3/µL',
  '10^6/µl': '10^6/µL',
  'x10^6/µl': '10^6/µL',
  'mil/µl': '10^6/µL',
  '10^9/l': '10^9/L',
  'x10^9/l': '10^9/L',
  '10^12/l': '10^12/L',
  'x10^12/l': '10^12/L',
  'g/dl': 'g/dL',
  'gr/dl': 'g/dL',
  'g/l': 'g/L',
  'mg/dl': 'mg/dL',
  'mg/l': 'mg/L',
  'µg/dl': 'µg/dL',
  'mcg/dl': 'µg/dL',
  'µg/l': 'µg/L',
  'mcg/l': 'µg/L',
  'ng/ml': 'ng/mL',
  'ng/dl': 'ng/dL',
  'pg/ml': 'pg/mL',
  pg: 'pg',
  fl: 'fL',
  'mmol/l': 'mmol/L',
  'µmol/l': 'µmol/L',
  'nmol/l': 'nmol/L',
  'pmol/l': 'pmol/L',
  'mmol/mol': 'mmol/mol',
  'meq/l': 'mEq/L',
  'u/l': 'U/L',
  'ui/l': 'U/L',
  'mu/ml': 'U/L',
  'mui/ml': 'mUI/mL',
  'ui/ml': 'UI/mL',
  'u/ml': 'UI/mL',
  'kui/l': 'UI/mL',
  'µui/ml': 'µUI/mL',
  'µu/ml': 'µUI/mL',
  'mui/l': 'mUI/L',
  'mu/l': 'mUI/L',
  'mm/h': 'mm/h',
  'mm/1h': 'mm/h',
  'leuc/µl': 'Leuc/µL',
  'ml/min': 'mL/min',
  'ml/min/173m2': 'mL/min/1.73m²',
  'ml/min/173m²': 'mL/min/1.73m²',
  sec: 's',
  s: 's',
};

/** Normalizes the spelling of a printed unit. Unknown units come back trimmed with a normalized micro sign. */
export function normalizeUnit(raw: string): string {
  const micro = raw
    .trim()
    .replace(/[μµ]/g, 'µ')
    .replace(/\bmicro\s*/i, 'µ');
  const key = micro.toLowerCase().replace(/[\s.]/g, '');
  return SPELLINGS[key] ?? micro;
}

function factorToCanonical(analyte: Analyte, unit: string): number | null {
  if (analyte.canonicalUnit === undefined) return null;
  if (unit === analyte.canonicalUnit) return 1;
  return analyte.units?.find((u) => u.unit === unit)?.toCanonical ?? null;
}

/** Units this analyte can be displayed in: canonical first. */
export function unitsOf(analyte: Analyte): string[] {
  if (analyte.canonicalUnit === undefined) return [];
  return [analyte.canonicalUnit, ...(analyte.units ?? []).map((u) => u.unit)];
}

/** Multiplier turning a value in `unit` into the analyte's canonical unit, or null when not convertible. */
export function toCanonicalFactor(analyte: Analyte, unit: string | null): number | null {
  if (unit === null) return analyte.canonicalUnit === undefined ? 1 : null;
  return factorToCanonical(analyte, normalizeUnit(unit));
}

/** Converts between two units of the same analyte. Returns null when either unit is unknown for it. */
export function convert(analyte: Analyte, value: number, from: string, to: string): number | null {
  const fromFactor = factorToCanonical(analyte, normalizeUnit(from));
  const toFactor = factorToCanonical(analyte, normalizeUnit(to));
  if (fromFactor === null || toFactor === null) return null;
  return (value * fromFactor) / toFactor;
}
