/**
 * Geometry of the rail, Bloodio's signature mark: the printed range is a track from 20% to 80%
 * of the width and the value is a point on it. Beyond the range the distance is compressed,
 * so a far outlier still fits.
 */
export const TRACK_START = 20;
export const TRACK_END = 80;
const OVERFLOW_ROOM = 16;
const OVERFLOW_SCALE = 40;

export type RailState = 'in' | 'above' | 'below';

export interface RailPosition {
  /** Horizontal position of the point, in percent of the rail width. */
  x: number;
  state: RailState;
}

export function railPosition(
  value: number,
  refMin: number | null,
  refMax: number | null,
): RailPosition | null {
  if (refMin === null && refMax === null) return null;
  // One-sided ranges: "< X" runs from zero, "> X" is drawn as the lower third of a track to 2X.
  const min = refMin ?? 0;
  const max = refMax ?? (refMin === 0 ? 1 : (refMin as number) * 2);
  if (max <= min) return null;

  const p = (value - min) / (max - min);
  const span = TRACK_END - TRACK_START;
  const above = refMax !== null && value > refMax;
  const below = refMin !== null && value < refMin;
  if (above)
    return { x: TRACK_END + Math.min(OVERFLOW_ROOM, (p - 1) * OVERFLOW_SCALE), state: 'above' };
  if (below)
    return { x: TRACK_START - Math.min(OVERFLOW_ROOM, -p * OVERFLOW_SCALE), state: 'below' };
  return { x: TRACK_START + Math.min(1, Math.max(0, p)) * span, state: 'in' };
}
