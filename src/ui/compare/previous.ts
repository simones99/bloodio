import type { Report } from '../../domain/types';

/** Sample date first, then creation time: the order a comparison reads two reports in. */
export function compareChronologically(a: Report, b: Report): number {
  return a.sampleDate.localeCompare(b.sampleDate) || a.createdAt.localeCompare(b.createdAt);
}

/** The two reports of a comparison, older first, whatever order the address gave them in. */
export function chronological(a: Report, b: Report): [older: Report, newer: Report] {
  return compareChronologically(a, b) <= 0 ? [a, b] : [b, a];
}

/** How many entries two reports have in common, from `listEntryRefsByReport`. */
export function sharedCount(a: Set<string> | undefined, b: Set<string> | undefined): number {
  if (!a || !b) return 0;
  let count = 0;
  for (const key of a) if (b.has(key)) count++;
  return count;
}

/**
 * "The previous report" for a comparison (spec 2026-10-14 §3.2): the closest earlier report that
 * measures at least one entry in common with `target`. Null when there is none.
 */
export function previousComparable(
  target: Report,
  reports: Report[],
  refs: Map<string, Set<string>>,
): Report | null {
  const own = refs.get(target.id);
  let best: Report | null = null;
  for (const report of reports) {
    if (report.id === target.id || compareChronologically(report, target) >= 0) continue;
    if (sharedCount(own, refs.get(report.id)) === 0) continue;
    if (!best || compareChronologically(report, best) > 0) best = report;
  }
  return best;
}
