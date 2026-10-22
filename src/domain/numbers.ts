import type { Comparator, PlausibleRange } from './types';

/** How to read a dot in tokens like "1.029": thousands separator (1029) or decimal point (1.029). */
export type DotMode = 'thousands' | 'decimal';

export interface ParsedValue {
  value: number | null;
  comparator: Comparator | null;
  /** The printed text, trimmed. */
  valueText: string;
}

/** A dot after a leading zero is always decimal: no lab writes "0.005" for five. */
const AMBIGUOUS = /^[1-9]\d{0,2}(\.\d{3})+$/;
const NUMERIC = /^\d+([.,]\d+)*$/;
const NUMBER_TOKEN = /\d[\d.,]*\d|\d/g;

/**
 * True for "7.510", "4.220.000", "1.029": the dot may be a thousands separator or a decimal point.
 * Never for "0.005".
 */
export function isAmbiguousNumber(token: string): boolean {
  return AMBIGUOUS.test(token.trim());
}

/** Parses a number printed the Italian way. A comma is always the decimal separator. */
export function parseItalianNumber(token: string, mode: DotMode = 'thousands'): number | null {
  const t = token.trim();
  if (!NUMERIC.test(t)) return null;
  let n: number;
  if (t.includes(',')) n = Number(t.replace(/\./g, '').replace(',', '.'));
  else if (AMBIGUOUS.test(t)) {
    // decimal mode keeps only the last dot: "1.029" -> 1.029
    n = Number(mode === 'thousands' ? t.replace(/\./g, '') : t.replace(/\.(?=.*\.)/g, ''));
  } else n = Number(t);
  return Number.isFinite(n) ? n : null;
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
  /** True when nothing settles how to read the ambiguous token, or the two verdicts disagree. */
  ambiguous: boolean;
}

/**
 * Decides how to read dots for one table row (value text plus reference text), from the first
 * ambiguous token (spec 2026-10-21 §3). Two verdicts, each given only when exactly one reading
 * fits: the analyte's plausible range, and the unambiguous numbers of the row ("anchors", within
 * 20 times). Decimal needs the plausible range and no contrary anchors. Thousands needs either
 * verdict and no contrary one. Anything else reads as thousands and reports the ambiguity: a wrong
 * thousands reading is a thousand times too big and shows; a wrong decimal one can look normal.
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
  const pick = (thousands: boolean, decimal: boolean): DotMode | null =>
    thousands === decimal ? null : thousands ? 'thousands' : 'decimal';

  let fromRange: DotMode | null = null;
  let noneFits = false;
  if (plausible) {
    const fits = (n: number) =>
      n * toCanonical >= plausible.min && n * toCanonical <= plausible.max;
    fromRange = pick(fits(asThousands), fits(asDecimal));
    noneFits = !fits(asThousands) && !fits(asDecimal);
  }

  let fromAnchors: DotMode | null = null;
  const anchors = tokens
    .filter((t) => !isAmbiguousNumber(t))
    .map((t) => parseItalianNumber(t))
    .filter((n): n is number => n !== null && n > 0);
  if (anchors.length > 0) {
    const low = Math.min(...anchors) / 20;
    const high = Math.max(...anchors) * 20;
    const near = (n: number) => n >= low && n <= high;
    fromAnchors = pick(near(asThousands), near(asDecimal));
  }

  const doubt: DotModeChoice = { mode: 'thousands', ambiguous: true };
  if (noneFits) return doubt;
  if (fromRange !== null) {
    return fromAnchors === null || fromAnchors === fromRange
      ? { mode: fromRange, ambiguous: false }
      : doubt;
  }
  return fromAnchors === 'thousands' ? { mode: 'thousands', ambiguous: false } : doubt;
}
