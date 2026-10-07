import { parseItalianNumber, type DotMode } from './numbers';

export interface ParsedReference {
  refMin: number | null;
  refMax: number | null;
  /** Reference exactly as printed, lines joined with "\n". null when nothing is printed. */
  refText: string | null;
  /** Limits taken from a descriptive multi-line reference ("> 30 Normale"). Must be confirmed by the user. */
  derived: boolean;
  /** Reference printed per age band; the adult band was used. Must be confirmed by the user. */
  ageStratified: boolean;
}

interface Bounds {
  refMin: number | null;
  refMax: number | null;
}

const NUM = String.raw`(\d[\d.,]*)`;
const RANGE = new RegExp(String.raw`^(?:da\s+)?${NUM}\s*(?:a|-|–)\s*${NUM}$`, 'i');
const UPPER = new RegExp(String.raw`^(?:<=?|fino a|inferiore a|minore di)\s*${NUM}$`, 'i');
const LOWER = new RegExp(String.raw`^(?:>=?|superiore a|maggiore di|oltre)\s*${NUM}$`, 'i');

function parseLine(line: string, mode: DotMode): Bounds | null {
  const text = line.trim();
  const range = RANGE.exec(text);
  if (range) {
    const min = parseItalianNumber(range[1] ?? '', mode);
    const max = parseItalianNumber(range[2] ?? '', mode);
    if (min !== null && max !== null && min <= max) return { refMin: min, refMax: max };
  }
  const upper = UPPER.exec(text);
  if (upper) {
    const max = parseItalianNumber(upper[1] ?? '', mode);
    if (max !== null) return { refMin: null, refMax: max };
  }
  const lower = LOWER.exec(text);
  if (lower) {
    const min = parseItalianNumber(lower[1] ?? '', mode);
    if (min !== null) return { refMin: min, refMax: null };
  }
  return null;
}

export function parseReference(text: string, mode: DotMode = 'thousands'): ParsedReference {
  const lines = text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '' && line !== '.' && line !== '-');
  const none = { refMin: null, refMax: null, derived: false, ageStratified: false };
  if (lines.length === 0) return { ...none, refText: null };

  const refText = lines.join('\n');
  if (lines.length === 1) {
    const bounds = parseLine(lines[0] ?? '', mode);
    return bounds ? { ...none, ...bounds, refText } : { ...none, refText };
  }

  // "Da 11 anni in poi: da 0,25 a 4": the open-ended band is the adult one.
  const adult = lines.find((line) => /anni in poi\s*:/i.test(line));
  if (adult) {
    const bounds = parseLine(adult.slice(adult.indexOf(':') + 1), mode);
    if (bounds) return { ...bounds, refText, derived: false, ageStratified: true };
  }

  // "> 30 Normale": the line the lab itself labels as normal.
  const normal = lines.find((line) => /\bnormal[ei]\b/i.test(line));
  if (normal) {
    const bounds = parseLine(normal.replace(/\bnormal[ei]\b/i, ''), mode);
    if (bounds) return { ...bounds, refText, derived: true, ageStratified: false };
  }

  return { ...none, refText };
}
