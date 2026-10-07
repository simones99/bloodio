import { astAdapter } from './ast';
import { genericAdapter } from './generic';
import { proavisAdapter } from './proavis';
import type { DraftReport, LabAdapter, PositionedText } from './types';

/** Add a lab by adding its adapter here. Existing adapters are never touched. */
export const ADAPTERS: readonly LabAdapter[] = [proavisAdapter, astAdapter];

/** Below this detection score the generic heuristic adapter is used instead. */
export const DETECT_THRESHOLD = 0.5;

export function detectAdapter(
  pt: PositionedText,
  adapters: readonly LabAdapter[] = ADAPTERS,
): LabAdapter {
  let best: LabAdapter = genericAdapter;
  let bestScore = 0;
  for (const adapter of adapters) {
    const score = adapter.detect(pt);
    if (score > bestScore) {
      best = adapter;
      bestScore = score;
    }
  }
  return bestScore >= DETECT_THRESHOLD ? best : genericAdapter;
}

export function parseReport(pt: PositionedText): DraftReport {
  return detectAdapter(pt).parse(pt);
}
