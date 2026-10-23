import type { BBox, PositionedPage } from '../parsers/types';

/** How the page OCR read was made from the original page (spec 2026-10-22 §3.2). */
export interface PageGeometry {
  /** The original page in its own units: PDF points at scale 1, or photo pixels after EXIF. */
  width: number;
  height: number;
  /** From the original's units to the canvas OCR read; 1 for a PDF text layer. */
  scale: number;
  /** Clockwise quarter turns applied after scaling. Always 0 until manual rotation exists. */
  quarterTurns: 0 | 1 | 2 | 3;
  /** The deskew angle preprocessCanvas applied, in degrees; 0 when it did not turn the page. */
  skewDegrees: number;
}

export interface Point {
  x: number;
  y: number;
}

/** A page read from a PDF text layer: its boxes are already in the original's points. */
export function identityGeometry(page: Pick<PositionedPage, 'width' | 'height'>): PageGeometry {
  return { width: page.width, height: page.height, scale: 1, quarterTurns: 0, skewDegrees: 0 };
}

/**
 * The four corners of a page box, from the page OCR read back to the original, clockwise from
 * top left. The chain of §3.2 is undone in reverse: the deskew, then the quarter turns, then the
 * scale. Canvas rotations are clockwise-positive with y down, and deskewing turned the page by
 * −skewDegrees about its centre, so +skewDegrees brings a point back.
 */
export function toOriginal(box: BBox, geometry: PageGeometry): [Point, Point, Point, Point] {
  const { scale, quarterTurns } = geometry;
  // The scaled original, before and after the quarter turns.
  const width = geometry.width * scale;
  const height = geometry.height * scale;
  const turnedWidth = quarterTurns % 2 === 0 ? width : height;
  const turnedHeight = quarterTurns % 2 === 0 ? height : width;
  const angle = (geometry.skewDegrees * Math.PI) / 180;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const unturn = (x: number, y: number): [number, number] => {
    switch (quarterTurns) {
      case 0:
        return [x, y];
      case 1:
        return [y, height - x];
      case 2:
        return [width - x, height - y];
      case 3:
        return [width - y, x];
    }
  };
  const back = (x: number, y: number): Point => {
    const dx = x - turnedWidth / 2;
    const dy = y - turnedHeight / 2;
    const [ux, uy] = unturn(
      turnedWidth / 2 + dx * cos - dy * sin,
      turnedHeight / 2 + dx * sin + dy * cos,
    );
    return { x: ux / scale, y: uy / scale };
  };
  return [
    back(box.x, box.y),
    back(box.x + box.w, box.y),
    back(box.x + box.w, box.y + box.h),
    back(box.x, box.y + box.h),
  ];
}
