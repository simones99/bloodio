/** One point of a series, already converted to a common unit, ordered by date ascending. */
export interface TrendPoint {
  value: number;
  refMin: number | null;
  refMax: number | null;
}

/** Share of the range (or of a one-sided limit) considered "close to the limit". */
export const WATCH_MARGIN = 0.15;

export type WatchSide = 'upper' | 'lower';

/**
 * Pure geometry on the printed range: the latest value is inside the range, close to a limit,
 * and moving towards it. No clinical meaning is implied.
 */
export function watchSide(points: TrendPoint[]): WatchSide | null {
  if (points.length < 2) return null;
  const last = points[points.length - 1]!;
  const previous = points[points.length - 2]!;
  const { value, refMin, refMax } = last;
  const rising = value > previous.value;
  const falling = value < previous.value;

  if (refMin !== null && refMax !== null) {
    if (value < refMin || value > refMax || refMax <= refMin) return null;
    const position = (value - refMin) / (refMax - refMin);
    if (position >= 1 - WATCH_MARGIN && rising) return 'upper';
    if (position <= WATCH_MARGIN && falling) return 'lower';
    return null;
  }
  if (refMax !== null) {
    if (value > refMax) return null;
    return value >= (1 - WATCH_MARGIN) * refMax && rising ? 'upper' : null;
  }
  if (refMin !== null) {
    if (value < refMin) return null;
    return value <= (1 + WATCH_MARGIN) * refMin && falling ? 'lower' : null;
  }
  return null;
}
