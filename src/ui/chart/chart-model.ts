import type { Comparator, OutOfRange } from '../../domain/types';
import { formatDisplayNumber, formatMonthShort } from '../i18n/it';

/** One plotted measurement, already in the display unit. */
export interface ChartPoint {
  /** Stable identity (the measurement id). */
  key: string;
  /** Sample date, ISO yyyy-mm-dd. */
  date: string;
  value: number;
  comparator: Comparator | null;
  refMin: number | null;
  refMax: number | null;
  outOfRange: OutOfRange;
}

/** Same precedence as the rail: out of range, then "<"/">" values, then everything else. */
export type PointShape = 'in' | 'out' | 'open';

export interface PlottedPoint {
  key: string;
  x: number;
  y: number;
  shape: PointShape;
  latest: boolean;
}

/** The printed range of one report, held from its date until the next report. */
export interface BandSegment {
  x0: number;
  x1: number;
  top: number;
  bottom: number;
  /** False for a "> X" range: the band runs to the top edge, which is not a printed limit. */
  hasTop: boolean;
  /** False for a "< X" range: the band runs to the bottom edge. */
  hasBottom: boolean;
}

export interface Tick {
  position: number;
  label: string;
}

export interface ChartModel {
  width: number;
  height: number;
  plot: { left: number; right: number; top: number; bottom: number };
  xTicks: Tick[];
  yTicks: Tick[];
  segments: BandSegment[];
  bandLabel: { x: number; y: number } | null;
  points: PlottedPoint[];
  scaleY(value: number): number;
}

/**
 * Room around the plot, inside the given size. `left` is a minimum: the real left margin grows
 * with the longest y label. `bottom` holds the x labels.
 */
export const CHART_MARGIN = { left: 40, right: 12, top: 12, bottom: 28 };
/** Approximate advance of one digit at the 11px axis size, and the gap between label and plot. */
const Y_LABEL_CHAR_WIDTH = 6.6;
const Y_LABEL_GAP = 8;
/** Keeps the first and last point clear of the plot edges. */
const INSET = 10;
export const MIN_X_LABEL_GAP = 56;
export const MIN_BAND_LABEL_HEIGHT = 16;
const MIN_BAND_LABEL_WIDTH = 96;
const Y_PADDING = 0.08;
const DAY_MS = 86_400_000;

function dayNumber(isoDate: string): number {
  const [year = 1970, month = 1, day = 1] = isoDate.split('-').map(Number);
  return Date.UTC(year, month - 1, day) / DAY_MS;
}

/** Drops floating-point noise such as 0.30000000000000004. */
const tidy = (value: number) => Number(value.toPrecision(12));

/** The smallest of 1, 2, 2.5, 5 times a power of ten that is at least `raw`. */
export function niceStep(raw: number): number {
  const power = 10 ** Math.floor(Math.log10(raw));
  for (const multiple of [1, 2, 2.5, 5]) {
    if (tidy(multiple * power) >= raw) return tidy(multiple * power);
  }
  return tidy(10 * power);
}

/** A y range on round ticks that covers every value, with a little air above and below. */
export function yDomain(values: number[]): { min: number; max: number; step: number } {
  let low = Math.min(...values);
  let high = Math.max(...values);
  if (low === high) {
    const pad = Math.abs(low) * 0.1 || 1;
    low -= pad;
    high += pad;
  }
  const span = high - low;
  const paddedLow = low - span * Y_PADDING;
  const paddedHigh = high + span * Y_PADDING;
  const step = niceStep((paddedHigh - paddedLow) / 4);
  let min = tidy(Math.floor(paddedLow / step) * step);
  const max = tidy(Math.ceil(paddedHigh / step) * step);
  if (min < 0 && low >= 0) min = 0;
  return { min, max, step };
}

/** First and last always (only the last if they collide); middle labels only where they fit. */
export function pickXTicks(candidates: Tick[]): Tick[] {
  const first = candidates[0];
  const last = candidates[candidates.length - 1];
  if (!first || !last) return [];
  if (candidates.length === 1 || last.position - first.position < MIN_X_LABEL_GAP) return [last];
  const chosen = [first];
  for (const tick of candidates.slice(1, -1)) {
    const previous = chosen[chosen.length - 1]!;
    if (
      tick.label !== previous.label &&
      tick.position - previous.position >= MIN_X_LABEL_GAP &&
      last.position - tick.position >= MIN_X_LABEL_GAP
    ) {
      chosen.push(tick);
    }
  }
  if (last.label !== chosen[chosen.length - 1]!.label) chosen.push(last);
  return chosen;
}

function shapeOf(point: ChartPoint): PointShape {
  if (point.outOfRange === true) return 'out';
  return point.comparator !== null ? 'open' : 'in';
}

function yTickValues(domain: { min: number; max: number; step: number }): number[] {
  const count = Math.round((domain.max - domain.min) / domain.step);
  return Array.from({ length: count + 1 }, (_, i) => tidy(domain.min + i * domain.step));
}

/** Pixel geometry for a trend chart. Pure: the SVG on screen and the PNG export draw the same model. */
export function buildChartModel(
  points: ChartPoint[],
  size: { width: number; height: number },
): ChartModel {
  const sorted = [...points].sort((a, b) => a.date.localeCompare(b.date));
  const days = sorted.map((p) => dayNumber(p.date));
  const values = sorted
    .flatMap((p) => [p.value, p.refMin, p.refMax])
    .filter((v): v is number => v !== null && Number.isFinite(v));
  const domain = yDomain(values.length > 0 ? values : [0]);
  // Long labels ("4.500.000") need more room than the base margin gives.
  const labelWidth = Math.max(
    ...yTickValues(domain).map((v) => formatDisplayNumber(v).length * Y_LABEL_CHAR_WIDTH),
  );
  const plot = {
    left: Math.max(CHART_MARGIN.left, Math.ceil(labelWidth) + Y_LABEL_GAP + 4),
    right: size.width - CHART_MARGIN.right,
    top: CHART_MARGIN.top,
    bottom: size.height - CHART_MARGIN.bottom,
  };
  let firstDay = Math.min(...days);
  let lastDay = Math.max(...days);
  if (firstDay === lastDay) {
    firstDay -= 1;
    lastDay += 1;
  }
  const scaleX = (day: number) =>
    plot.left +
    INSET +
    ((day - firstDay) / (lastDay - firstDay)) * (plot.right - plot.left - 2 * INSET);

  const scaleY = (value: number) =>
    plot.bottom - ((value - domain.min) / (domain.max - domain.min)) * (plot.bottom - plot.top);

  const segments: BandSegment[] = [];
  sorted.forEach((p, i) => {
    if (p.refMin === null && p.refMax === null) return;
    const x0 = scaleX(days[i]!);
    const x1 = i < sorted.length - 1 ? scaleX(days[i + 1]!) : plot.right;
    if (x1 <= x0) return;
    segments.push({
      x0,
      x1,
      top: p.refMax !== null ? scaleY(p.refMax) : plot.top,
      bottom: p.refMin !== null ? scaleY(p.refMin) : plot.bottom,
      hasTop: p.refMax !== null,
      hasBottom: p.refMin !== null,
    });
  });

  const roomy = segments.find(
    (s) => s.bottom - s.top >= MIN_BAND_LABEL_HEIGHT && s.x1 - s.x0 >= MIN_BAND_LABEL_WIDTH,
  );

  const yTicks: Tick[] = yTickValues(domain).map((value) => ({
    position: scaleY(value),
    label: formatDisplayNumber(value),
  }));

  return {
    width: size.width,
    height: size.height,
    plot,
    xTicks: pickXTicks(
      sorted.map((p, i) => ({ position: scaleX(days[i]!), label: formatMonthShort(p.date) })),
    ),
    yTicks,
    segments,
    bandLabel: roomy ? { x: roomy.x0 + 6, y: roomy.bottom - 6 } : null,
    points: sorted.map((p, i) => ({
      key: p.key,
      x: scaleX(days[i]!),
      y: scaleY(p.value),
      shape: shapeOf(p),
      latest: i === sorted.length - 1,
    })),
    scaleY,
  };
}

const coord = (value: number) => Number(value.toFixed(2));
const toPath = (pairs: [number, number][]) =>
  'M' + pairs.map(([x, y]) => `${coord(x)} ${coord(y)}`).join('L');

export type Polyline = [number, number][];

/** Band geometry: one closed polygon per run of touching segments, and the printed-limit edges. */
export function bandShapes(segments: BandSegment[]): { fills: Polyline[]; edges: Polyline[] } {
  const runs: BandSegment[][] = [];
  for (const segment of segments) {
    const run = runs[runs.length - 1];
    if (run && run[run.length - 1]!.x1 === segment.x0) run.push(segment);
    else runs.push([segment]);
  }

  const fills = runs.map((run): Polyline => [
    ...run.flatMap((s): Polyline => [
      [s.x0, s.top],
      [s.x1, s.top],
    ]),
    ...[...run].reverse().flatMap((s): Polyline => [
      [s.x1, s.bottom],
      [s.x0, s.bottom],
    ]),
  ]);

  const edges: Polyline[] = [];
  for (const run of runs) {
    for (const side of ['top', 'bottom'] as const) {
      let current: Polyline = [];
      const flush = () => {
        if (current.length > 0) edges.push(current);
        current = [];
      };
      for (const s of run) {
        if (!(side === 'top' ? s.hasTop : s.hasBottom)) {
          flush();
          continue;
        }
        current.push([s.x0, s[side]], [s.x1, s[side]]);
      }
      flush();
    }
  }
  return { fills, edges };
}

/** The band as SVG path data. */
export function bandPaths(segments: BandSegment[]): { fills: string[]; edges: string[] } {
  const { fills, edges } = bandShapes(segments);
  return { fills: fills.map((p) => toPath(p) + 'Z'), edges: edges.map(toPath) };
}

export function linePath(points: PlottedPoint[]): string {
  return points.length === 0 ? '' : toPath(points.map((p): [number, number] => [p.x, p.y]));
}

/** What a point's detail box says. Built by the page, shown by the chart. */
export interface PointDetail {
  /** Accessible name of the point: date, value and position against the printed range. */
  label: string;
  value: string;
  date: string;
  lab: string;
  /** In-app path of the report the value comes from. */
  href: string;
}

export type CalloutAlign = 'start' | 'center' | 'end';

export interface CalloutPlacement {
  /** Anchor point in chart pixels; `align` and `side` say how the box hangs from it. */
  left: number;
  top: number;
  align: CalloutAlign;
  side: 'above' | 'below';
}

/**
 * The box is about 130px tall: above a point it needs this much room, or it would leave the chart
 * and cover the header. Otherwise it goes below, where it may extend past the chart (never over the header).
 */
export const CALLOUT_MIN_ABOVE = 140;
const CALLOUT_GAP = 14;

/** Where a point's detail box goes: above the point when there is room for it, kept inside the chart horizontally. */
export function calloutPlacement(
  point: { x: number; y: number },
  size: { width: number; height: number },
): CalloutPlacement {
  const align: CalloutAlign =
    point.x < size.width * 0.3 ? 'start' : point.x > size.width * 0.7 ? 'end' : 'center';
  const side = point.y < CALLOUT_MIN_ABOVE ? 'below' : 'above';
  return {
    left: point.x,
    top: side === 'above' ? point.y - CALLOUT_GAP : point.y + CALLOUT_GAP,
    align,
    side,
  };
}
