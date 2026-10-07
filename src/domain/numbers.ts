import type { Comparator, PlausibleRange } from './types';

/** How to read a dot in tokens like "1.029": thousands separator (1029) or decimal point (1.029). */
export type DotMode = 'thousands' | 'decimal';

export interface ParsedValue {
  value: number | null;
  comparator: Comparator | null;
  /** The printed text, trimmed. */
  valueText: string;
}

const AMBIGUOUS = /^\d{1,3}(\.\d{3})+$/;
const NUMERIC = /^\d+([.,]\d+)*$/;
const NUMBER_TOKEN = /\d[\d.,]*\d|\d/g;

/** True for "7.510", "4.220.000", "1.029": the dot may be a thousands separator or a decimal point. */
export function isAmbiguousNumber(token: string): boolean {
  return AMBIGUOUS.test(token.trim());
}

/** Parses a number printed the Italian way. A comma is always the decimal separator. */
export function parseItalianNumber(token: string, mode: DotMode = 'thousands'): number | null {
  const t = token.trim();
  if (!NUMERIC.test(t)) return null;
  if (t.includes(',')) return Number(t.replace(/\./g, '').replace(',', '.'));
  if (AMBIGUOUS.test(t)) {
    // decimal mode keeps only the last dot: "1.029" -> 1.029
    return Number(mode === 'thousands' ? t.replace(/\./g, '') : t.replace(/\.(?=.*\.)/g, ''));
  }
  return Number(t);
}

export function parseValue(text: string, mode: DotMode = 'thousands'): ParsedValue {
  const valueText = text.trim();
  const match = /^(<=|>=|<|>)?\s*(\d[\d.,]*)$/.exec(valueText);
  if (!match || match[2] === undefined) return { value: null, comparator: null, valueText };
  const value = parseItalianNumber(match[2], mode);
  if (value === null) return { value: null, comparator: null, valueText };
  return { value, comparator: (match[1] as Comparator | undefined) ?? null, valueText };
}

export function numberTokens(text: string): string[] {
  return text.match(NUMBER_TOKEN) ?? [];
}

export interface DotModeChoice {
  mode: DotMode;
  /** True when the texts contain an ambiguous token and nothing could settle how to read it. */
  ambiguous: boolean;
}

/**
 * Decides how to read dots for one table row (value text plus reference text).
 * 1. The analyte's plausible range settles it when exactly one reading is plausible.
 * 2. Otherwise unambiguous numbers in the same row give the expected magnitude.
 * 3. Otherwise read as thousands and report the ambiguity.
 */
export function chooseDotMode(
  texts: string[],
  plausible?: PlausibleRange,
  toCanonical = 1,
): DotModeChoice {
  const tokens = texts.flatMap(numberTokens);
  const first = tokens.find(isAmbiguousNumber);
  if (first === undefined) return { mode: 'thousands', ambiguous: false };

  const asThousands = parseItalianNumber(first, 'thousands')!;
  const asDecimal = parseItalianNumber(first, 'decimal')!;

  if (plausible) {
    const fits = (n: number) =>
      n * toCanonical >= plausible.min && n * toCanonical <= plausible.max;
    if (fits(asThousands) !== fits(asDecimal)) {
      return { mode: fits(asThousands) ? 'thousands' : 'decimal', ambiguous: false };
    }
  }

  const anchors = tokens
    .filter((t) => !isAmbiguousNumber(t))
    .map((t) => parseItalianNumber(t))
    .filter((n): n is number => n !== null && n > 0);
  if (anchors.length > 0) {
    const low = Math.min(...anchors) / 20;
    const high = Math.max(...anchors) * 20;
    const near = (n: number) => n >= low && n <= high;
    if (near(asThousands) !== near(asDecimal)) {
      return { mode: near(asThousands) ? 'thousands' : 'decimal', ambiguous: false };
    }
  }

  return { mode: 'thousands', ambiguous: true };
}
