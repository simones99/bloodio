import { matchAnalyte } from '../domain/matching';

/**
 * A name printed with no value could be a section heading, or a catalog
 * analyte whose value column was mis-read (e.g. by OCR). Only an exact
 * catalog match is kept as a row; anything else is still treated as a
 * heading, as before.
 */
export function keepEmptyValueAsRow(name: string, section: string | null): boolean {
  const match = matchAnalyte(name, { section });
  return match.status === 'matched' && match.score === 1;
}
