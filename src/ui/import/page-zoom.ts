// Zoom and pan of the page in "Vedi originale" (spec 2026-10-22 §4.5), with no DOM so it runs in
// Vitest. The page is drawn at `zoom` CSS pixels per unit of the original, with its top left
// corner at (x, y) in the visible area.
import type { Point } from '../../ingest/page-geometry';
import type { BBox } from '../../parsers/types';

/** What the zoom works within: the page in its original units, and the visible area in CSS px. */
export interface ZoomFrame {
  pageWidth: number;
  pageHeight: number;
  /** The width of the drawn canvas, in its pixels: past 2 CSS px each, nothing more shows. */
  canvasWidth: number;
  areaWidth: number;
  areaHeight: number;
}

export interface PageView {
  zoom: number;
  x: number;
  y: number;
}

/** On opening, a line of the row aims at this height, in CSS px: lower on a narrow area. */
const LINE_PX = 20;
const NARROW_LINE_PX = 16;
/** An area narrower than this is a phone's: its rows aim at NARROW_LINE_PX. */
const NARROW_AREA_PX = 400;
/** On opening, the stretch from the name to the value keeps this far from the area's edges. */
const MARGIN_PX = 16;
/** To fit the stretch, a line goes no lower than this; past it the value wins. */
const MIN_LINE_PX = 12;
const MAX_PX_PER_CANVAS_PIXEL = 2;
/** "Ingrandisci" multiplies by this, "Riduci" divides. */
export const ZOOM_STEP = 1.5;
/** One arrow key press moves the page by this, in CSS px. */
export const ARROW_PX = 40;

/**
 * The height of one line of the row, in the units of the original: the box holds the row's first
 * line and the continuation lines of its range. `scale` takes the box's units to the original's.
 */
export function rowLineHeight(origin: { bbox: BBox; rawRef: string }, scale: number): number {
  const lines = origin.rawRef.split('\n').length;
  return origin.bbox.h / lines / scale;
}

/** From the page as wide as the area to 2 CSS px per canvas pixel. */
export function zoomLimits(frame: ZoomFrame): { min: number; max: number } {
  const min = frame.areaWidth / frame.pageWidth;
  const max = (MAX_PX_PER_CANVAS_PIXEL * frame.canvasWidth) / frame.pageWidth;
  return { min, max: Math.max(min, max) };
}

const clampZoom = (zoom: number, frame: ZoomFrame) => {
  const { min, max } = zoomLimits(frame);
  return Math.min(max, Math.max(min, zoom));
};

/** One axis: the page never leaves the area past its edges, and is centred when it is smaller. */
function clampOffset(offset: number, content: number, area: number): number {
  if (content <= area) return (area - content) / 2;
  return Math.min(0, Math.max(area - content, offset));
}

function clamped(view: PageView, frame: ZoomFrame): PageView {
  return {
    zoom: view.zoom,
    x: clampOffset(view.x, frame.pageWidth * view.zoom, frame.areaWidth),
    y: clampOffset(view.y, frame.pageHeight * view.zoom, frame.areaHeight),
  };
}

/** `focus`, a point of the page, at the centre of the area, as far as the edges allow. */
function centredOn(zoom: number, focus: Point, frame: ZoomFrame): PageView {
  return clamped(
    { zoom, x: frame.areaWidth / 2 - focus.x * zoom, y: frame.areaHeight / 2 - focus.y * zoom },
    frame,
  );
}

/** A box on the original, clockwise from its top left corner as read: what toOriginal gives. */
export type Corners = readonly [Point, Point, Point, Point];

/** The centre of a box: where its diagonals cross. */
export function centreOf(box: Corners): Point {
  const [a, b, c, d] = box;
  return { x: (a.x + b.x + c.x + d.x) / 4, y: (a.y + b.y + c.y + d.y) / 4 };
}

/**
 * On opening (spec 2026-10-22 §4.5): `row` is the rectangle of the row and `value` the box of its
 * value, null when the adapter did not read it on its own.
 */
export function initialView(
  frame: ZoomFrame,
  lineHeight: number,
  row: Corners,
  value: Corners | null,
): PageView {
  const linePx = frame.areaWidth < NARROW_AREA_PX ? NARROW_LINE_PX : LINE_PX;
  const aimed = linePx / lineHeight;
  if (!value) return centredOn(clampZoom(aimed, frame), centreOf(row), frame);
  // The stretch from the name to the value: the row's start, as read, and the value's end.
  const stretch = boundsOf([row[0], row[3], value[1], value[2]]);
  const fitting = Math.min(
    (frame.areaWidth - 2 * MARGIN_PX) / stretch.w,
    (frame.areaHeight - 2 * MARGIN_PX) / stretch.h,
  );
  const lowest = MIN_LINE_PX / lineHeight;
  const middle = { x: stretch.x + stretch.w / 2, y: stretch.y + stretch.h / 2 };
  if (fitting >= lowest)
    return centredOn(clampZoom(Math.min(aimed, fitting), frame), middle, frame);
  // Not even at the lowest zoom: the value wins, its end at the right margin, so that the view
  // reaches as far towards the name as it can.
  const zoom = clampZoom(lowest, frame);
  const valueEnd = Math.max(value[1].x, value[2].x);
  return clamped(
    {
      zoom,
      x: frame.areaWidth - MARGIN_PX - valueEnd * zoom,
      y: frame.areaHeight / 2 - middle.y * zoom,
    },
    frame,
  );
}

/** The straight box holding the points, in their units: a tilted stretch takes more room. */
function boundsOf(points: readonly Point[]): BBox {
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
}

/** The page as wide as the area, the row still centred vertically. */
export function fitWidth(frame: ZoomFrame, focus: Point): PageView {
  return centredOn(zoomLimits(frame).min, focus, frame);
}

/** Zooms by `factor` keeping the page point under `about` in place: the area's centre by default. */
export function zoomBy(
  view: PageView,
  factor: number,
  frame: ZoomFrame,
  about: Point = { x: frame.areaWidth / 2, y: frame.areaHeight / 2 },
): PageView {
  const zoom = clampZoom(view.zoom * factor, frame);
  const ratio = zoom / view.zoom;
  return clamped(
    { zoom, x: about.x - (about.x - view.x) * ratio, y: about.y - (about.y - view.y) * ratio },
    frame,
  );
}

/** Moves the page by (dx, dy) CSS px. */
export function panBy(view: PageView, dx: number, dy: number, frame: ZoomFrame): PageView {
  return clamped({ zoom: view.zoom, x: view.x + dx, y: view.y + dy }, frame);
}
