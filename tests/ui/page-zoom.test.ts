import { describe, expect, it } from 'vitest';
import type { Point } from '../../src/ingest/page-geometry';
import {
  fitWidth,
  initialView,
  panBy,
  rowLineHeight,
  zoomBy,
  zoomLimits,
  type PageView,
  type ZoomFrame,
} from '../../src/ui/import/page-zoom';

// An A4 page in PDF points, drawn at 300 DPI, shown in a 400 × 700 phone area.
const frame: ZoomFrame = {
  pageWidth: 612,
  pageHeight: 792,
  canvasWidth: 2550,
  areaWidth: 400,
  areaHeight: 700,
};
const minZoom = 400 / 612;
const maxZoom = (2 * 2550) / 612;

const near = (view: PageView) => ({
  zoom: expect.closeTo(view.zoom, 4),
  x: expect.closeTo(view.x, 2),
  y: expect.closeTo(view.y, 2),
});

describe('rowLineHeight', () => {
  it('is the box height, in the units of the original', () => {
    expect(rowLineHeight({ bbox: { x: 0, y: 0, w: 100, h: 12 }, rawRef: '0,27 - 4,20' }, 1)).toBe(
      12,
    );
    // A box read from a 300 DPI scan is in its pixels: 50 pixels are 12 points.
    expect(rowLineHeight({ bbox: { x: 0, y: 0, w: 100, h: 50 }, rawRef: '' }, 300 / 72)).toBe(12);
  });

  it('splits the box among the continuation lines of the range', () => {
    const origin = {
      bbox: { x: 0, y: 0, w: 100, h: 36 },
      rawRef: '4-10 Carenza\n10-30 Moderata\n> 30',
    };
    expect(rowLineHeight(origin, 1)).toBe(12);
  });
});

describe('zoomLimits', () => {
  it('goes from the page as wide as the area to 2 CSS pixels per canvas pixel', () => {
    expect(zoomLimits(frame)).toEqual({
      min: expect.closeTo(minZoom, 6),
      max: expect.closeTo(maxZoom, 6),
    });
  });

  it('never lets the maximum fall below the minimum, for a small canvas', () => {
    const { min, max } = zoomLimits({ ...frame, canvasWidth: 100 });
    expect(max).toBe(min);
  });
});

/** The corners of a box, clockwise from top left, as toOriginal gives them for a straight page. */
const corners = (x: number, y: number, w: number, h: number): [Point, Point, Point, Point] => [
  { x, y },
  { x: x + w, y },
  { x: x + w, y: y + h },
  { x, y: y + h },
];

describe('initialView without the box of the value', () => {
  // A row 12 points high centred on (300, 400).
  const row = corners(250, 394, 100, 12);

  it('makes a line of text 20 CSS pixels high in an area 400 wide, with the row at the centre', () => {
    // 20 / 12 points; the centre of the row goes to (200, 350), the middle of the area.
    expect(initialView(frame, 12, row, null)).toEqual(
      near({ zoom: 20 / 12, x: 200 - 300 * (20 / 12), y: 350 - 400 * (20 / 12) }),
    );
  });

  it('makes a line 16 CSS pixels high in an area narrower than 400', () => {
    expect(initialView({ ...frame, areaWidth: 399 }, 12, row, null).zoom).toBeCloseTo(16 / 12);
  });

  it('starts no smaller than the page as wide as the area', () => {
    expect(initialView(frame, 100, row, null).zoom).toBeCloseTo(minZoom);
    expect(initialView(frame, 100, row, null).x).toBeCloseTo(0);
  });

  it('starts no larger than 2 CSS pixels per canvas pixel', () => {
    expect(initialView(frame, 1, row, null).zoom).toBeCloseTo(maxZoom);
  });

  it('keeps the page inside the area near its edges', () => {
    // A row in the top left corner: centring it would show blank space above and to the left.
    expect(initialView(frame, 12, corners(5, 4, 10, 12), null)).toEqual(
      near({ zoom: 20 / 12, x: 0, y: 0 }),
    );
    // In the bottom right corner the page's far edges meet the area's.
    const corner = initialView(frame, 12, corners(595, 774, 10, 12), null);
    expect(corner.x).toBeCloseTo(400 - 612 * (20 / 12));
    expect(corner.y).toBeCloseTo(700 - 792 * (20 / 12));
  });
});

describe('initialView with the box of the value', () => {
  // A row from x 200 to 560, 12 points high, with its value from x 300 to 320: the stretch from
  // the name to the value is 120 points wide, centred on (260, 400), away from the page's edges.
  const row = corners(200, 394, 360, 12);
  const value = corners(300, 395, 20, 10);

  it('centres the stretch from the name to the value when it fits at 20 pixels a line', () => {
    // 120 points at 20 / 12 are 200 pixels, inside the 368 between the margins.
    expect(initialView(frame, 12, row, value)).toEqual(
      near({ zoom: 20 / 12, x: 200 - 260 * (20 / 12), y: 350 - 400 * (20 / 12) }),
    );
  });

  it('zooms out until the stretch fits between the margins of 16 pixels', () => {
    // From x 100 to 376: 276 points, 460 pixels at 20 a line. In the 368 pixels between the
    // margins they fit at 368 / 276 = 4 / 3, a line 16 pixels high; the stretch centred on 238.
    const wide = initialView(frame, 12, corners(100, 394, 460, 12), corners(356, 395, 20, 10));
    expect(wide).toEqual(near({ zoom: 4 / 3, x: 200 - 238 * (4 / 3), y: 350 - 400 * (4 / 3) }));
  });

  it('keeps the value in view, 16 pixels from the right edge, when not even 12 a line fits', () => {
    // From x 40 to 480: 440 points, more than the 368 pixels at zoom 1, a line 12 pixels high.
    // The zoom stays there and the value's end, 480, goes to 400 − 16 = 384.
    const wider = initialView(frame, 12, corners(40, 394, 500, 12), corners(450, 395, 30, 10));
    expect(wider).toEqual(near({ zoom: 1, x: 384 - 480, y: 350 - 400 }));
  });

  it('takes the room of a tilted stretch, as on a photo straightened by 2°', () => {
    // The row goes down 16 points over its 460: the value ends lower than the name starts. The
    // stretch spans x 100 to 376 and y 394 to 414, so its centre is (238, 404).
    const row = [
      { x: 100, y: 394 },
      { x: 560, y: 410 },
      { x: 560, y: 422 },
      { x: 100, y: 406 },
    ] as const;
    const value = [
      { x: 356, y: 403 },
      { x: 376, y: 404 },
      { x: 376, y: 414 },
      { x: 356, y: 413 },
    ] as const;
    expect(initialView(frame, 12, row, value)).toEqual(
      near({ zoom: 4 / 3, x: 200 - 238 * (4 / 3), y: 350 - 404 * (4 / 3) }),
    );
  });

  it('stays within the limits of the zoom and the edges of the page', () => {
    // Near the left edge of the page, centring the stretch would show blank space on the left.
    expect(initialView(frame, 12, corners(40, 394, 500, 12), corners(140, 395, 20, 10)).x).toBe(0);
    expect(initialView(frame, 1, row, value).zoom).toBeCloseTo(maxZoom);
  });
});

// At zoom 2 the page is 1224 × 1584: x from 400 − 1224 to 0, y from 700 − 1584 to 0.
const view: PageView = { zoom: 2, x: -100, y: -200 };

describe('zoomBy', () => {
  it('multiplies by 1.5 about the centre of the area', () => {
    // The page point under the centre (200, 350) stays there.
    expect(zoomBy(view, 1.5, frame)).toEqual(near({ zoom: 3, x: -250, y: -475 }));
  });

  it('comes back when divided by 1.5', () => {
    expect(zoomBy(zoomBy(view, 1.5, frame), 1 / 1.5, frame)).toEqual(near(view));
  });

  it('zooms about a given point, for a pinch', () => {
    // The page point under (0, 0) stays under (0, 0).
    expect(zoomBy(view, 2, frame, { x: 0, y: 0 })).toEqual(near({ zoom: 4, x: -200, y: -400 }));
  });

  it('stops at the limits', () => {
    expect(zoomBy({ zoom: maxZoom, x: -1000, y: -1000 }, 1.5, frame).zoom).toBeCloseTo(maxZoom);
    expect(zoomBy({ zoom: minZoom, x: 0, y: 0 }, 1 / 1.5, frame).zoom).toBeCloseTo(minZoom);
  });
});

describe('fitWidth', () => {
  it('makes the page as wide as the area, with the row still centred vertically', () => {
    const short = { ...frame, areaHeight: 300 };
    expect(fitWidth(short, { x: 300, y: 400 })).toEqual(
      near({ zoom: minZoom, x: 0, y: 150 - 400 * minZoom }),
    );
  });

  it('centres a page shorter than the area', () => {
    // 792 × 400 / 612 ≈ 517.6 pixels high in a 700-pixel area.
    expect(fitWidth(frame, { x: 300, y: 400 }).y).toBeCloseTo((700 - 792 * minZoom) / 2);
  });
});

describe('panBy', () => {
  it('moves the page by the given CSS pixels', () => {
    expect(panBy(view, -40, 40, frame)).toEqual(near({ zoom: 2, x: -140, y: -160 }));
  });

  it('never moves the page past its edges', () => {
    expect(panBy(view, 500, -1000, frame)).toEqual(near({ zoom: 2, x: 0, y: -884 }));
    expect(panBy(view, -1000, 500, frame)).toEqual(near({ zoom: 2, x: -824, y: 0 }));
  });

  it('keeps a page smaller than the area centred', () => {
    const small: PageView = { zoom: minZoom, x: 0, y: 0 };
    expect(panBy(small, 40, 40, frame)).toEqual(
      near({ zoom: minZoom, x: 0, y: (700 - 792 * minZoom) / 2 }),
    );
  });
});
