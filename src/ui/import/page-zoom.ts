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

/** On opening, a line of the row is about this high, in CSS px. */
const LINE_PX = 20;
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

/** On opening: a line of the row about 20 CSS px high, the row at the centre. */
export function initialView(frame: ZoomFrame, focus: Point, lineHeight: number): PageView {
  return centredOn(clampZoom(LINE_PX / lineHeight, frame), focus, frame);
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
