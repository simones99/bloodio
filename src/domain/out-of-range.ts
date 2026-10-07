import type { Measurement, OutOfRange } from './types';

export type RangeInput = Pick<
  Measurement,
  'value' | 'comparator' | 'valueText' | 'refMin' | 'refMax' | 'refText'
>;

const ABSENT = /^(assent[ei]|negativ[oaei]|non rilevat[oaei]|non rilevabil[ei])$/;

function stem(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, ' ');
}

function qualitative(valueText: string, m: RangeInput): OutOfRange {
  if (m.refText === null) return null;
  const value = stem(valueText);
  const reference = stem(m.refText);
  if (value === '') return null;
  const valueAbsent = ABSENT.test(value);
  const referenceAbsent = ABSENT.test(reference);
  if (valueAbsent && (referenceAbsent || m.refMax !== null)) return false; // "Assente" vs "Assente" or "Fino a 20"
  if (referenceAbsent) return true; // something found where nothing is expected
  if (value === reference) return false;
  return null;
}

/**
 * Compares a measurement with the reference printed on the same report.
 * Limits belong to the range. Returns null whenever the comparison cannot be decided.
 */
export function computeOutOfRange(m: RangeInput): OutOfRange {
  if (m.value === null) return qualitative(m.valueText, m);
  if (m.refMin === null && m.refMax === null) return null;

  const { value, refMin, refMax } = m;
  switch (m.comparator) {
    case null:
      return (refMin !== null && value < refMin) || (refMax !== null && value > refMax);
    case '<':
    case '<=': {
      // The true value lies below `value`.
      if (refMin !== null && (m.comparator === '<' ? value <= refMin : value < refMin)) return true;
      if (refMin === null && refMax !== null && value <= refMax) return false;
      return null;
    }
    case '>':
    case '>=': {
      // The true value lies above `value`.
      if (refMax !== null && (m.comparator === '>' ? value >= refMax : value > refMax)) return true;
      if (refMax === null && refMin !== null && value >= refMin) return false;
      return null;
    }
  }
}
