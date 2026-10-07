import { CATALOG } from './catalog';
import { normalizeName } from './normalize';
import type { Analyte, Specimen } from './types';
import { normalizeUnit, unitsOf } from './units';

/** At or above: the analyte is applied automatically. */
export const AUTO_MATCH_THRESHOLD = 0.88;
/** At or above (and below AUTO): shown as "forse: X", never applied silently. */
export const SUGGEST_THRESHOLD = 0.65;
/** Names this short are matched exactly only: "MCH" and "MCHC" differ by one letter. */
const MIN_FUZZY_LENGTH = 6;

export type MatchStatus = 'matched' | 'suggested' | 'none';

export interface AnalyteMatch {
  status: MatchStatus;
  /** Set only when status is 'matched'. */
  analyteId: string | null;
  /** Set only when status is 'suggested'. */
  suggestionId: string | null;
  score: number;
  /** Several analytes share this name and neither section nor unit could tell them apart. */
  ambiguous: boolean;
}

export interface MatchContext {
  unit?: string | null;
  section?: string | null;
}

const NONE: AnalyteMatch = {
  status: 'none',
  analyteId: null,
  suggestionId: null,
  score: 0,
  ambiguous: false,
};

const ALIASES: { alias: string; analyte: Analyte }[] = CATALOG.flatMap((analyte) =>
  [...new Set(analyte.aliases.map(normalizeName))].map((alias) => ({ alias, analyte })),
);

export function specimenOfSection(section: string | null | undefined): Specimen | null {
  if (!section) return null;
  return /urin|sediment/i.test(section) ? 'urine' : 'blood';
}

/** The printed name plus, when it has a parenthesis, its outer and inner parts: "Ab-anti Perossidasi (Ab-TPO)". */
function nameVariants(rawName: string): string[] {
  const variants = [normalizeName(rawName)];
  const paren = /^(.*?)\(([^)]+)\)\s*$/.exec(rawName);
  if (paren) variants.push(normalizeName(paren[1] ?? ''), normalizeName(paren[2] ?? ''));
  return [...new Set(variants.filter((v) => v !== ''))];
}

function levenshtein(a: string, b: string): number {
  let previous = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const current = [i];
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      current[j] = Math.min(
        (previous[j] ?? 0) + 1,
        (current[j - 1] ?? 0) + 1,
        (previous[j - 1] ?? 0) + cost,
      );
    }
    previous = current;
  }
  return previous[b.length] ?? 0;
}

function tokenSimilarity(a: string, b: string): number {
  if (a === b) return 1;
  if (a.length <= 3 || b.length <= 3) return 0;
  return 1 - levenshtein(a, b) / Math.max(a.length, b.length);
}

function directed(from: string[], to: string[]): number {
  const total = from.reduce(
    (sum, token) => sum + Math.max(...to.map((t) => tokenSimilarity(token, t))),
    0,
  );
  return total / from.length;
}

/** Token-based similarity in 0..1. Symmetric, so "colesterolo totale" does not match "colesterolo hdl". */
export function similarity(a: string, b: string): number {
  const ta = a.split(' ').filter(Boolean);
  const tb = b.split(' ').filter(Boolean);
  if (ta.length === 0 || tb.length === 0) return 0;
  return Math.min(directed(ta, tb), directed(tb, ta));
}

function disambiguate(
  candidates: Analyte[],
  context: MatchContext,
): { analyte: Analyte; ambiguous: boolean } {
  let pool = candidates;
  const specimen = specimenOfSection(context.section);
  if (specimen) {
    const bySpecimen = pool.filter((a) => a.specimen === specimen);
    if (bySpecimen.length > 0) pool = bySpecimen;
  }
  if (pool.length > 1 && context.unit) {
    const unit = normalizeUnit(context.unit);
    const byUnit = pool.filter((a) => unitsOf(a).includes(unit));
    if (byUnit.length > 0) pool = byUnit;
  }
  return { analyte: pool[0]!, ambiguous: pool.length > 1 };
}

export function matchAnalyte(rawName: string, context: MatchContext = {}): AnalyteMatch {
  const variants = nameVariants(rawName);
  if (variants.length === 0) return NONE;

  for (const variant of variants) {
    const exact = [
      ...new Set(ALIASES.filter((entry) => entry.alias === variant).map((entry) => entry.analyte)),
    ];
    if (exact.length > 0) {
      const { analyte, ambiguous } = disambiguate(exact, context);
      return { status: 'matched', analyteId: analyte.id, suggestionId: null, score: 1, ambiguous };
    }
  }

  const full = variants[0]!;
  if (full.length < MIN_FUZZY_LENGTH) return NONE;

  let bestScore = 0;
  let best: Analyte[] = [];
  for (const entry of ALIASES) {
    if (entry.alias.length < MIN_FUZZY_LENGTH) continue;
    const score = similarity(full, entry.alias);
    if (score > bestScore + 1e-9) {
      bestScore = score;
      best = [entry.analyte];
    } else if (Math.abs(score - bestScore) <= 1e-9 && !best.includes(entry.analyte)) {
      best.push(entry.analyte);
    }
  }
  if (bestScore < SUGGEST_THRESHOLD || best.length === 0) return NONE;

  const { analyte, ambiguous } = disambiguate(best, context);
  if (bestScore >= AUTO_MATCH_THRESHOLD) {
    return {
      status: 'matched',
      analyteId: analyte.id,
      suggestionId: null,
      score: bestScore,
      ambiguous,
    };
  }
  return {
    status: 'suggested',
    analyteId: null,
    suggestionId: analyte.id,
    score: bestScore,
    ambiguous,
  };
}
