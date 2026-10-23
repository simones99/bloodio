import { describe, expect, it } from 'vitest';
import { identityGeometry, toOriginal } from '../../src/ingest/page-geometry';

describe('identityGeometry', () => {
  it('keeps the page size and changes nothing else', () => {
    expect(identityGeometry({ width: 595, height: 842 })).toEqual({
      width: 595,
      height: 842,
      scale: 1,
      quarterTurns: 0,
      skewDegrees: 0,
    });
  });
});

describe('toOriginal', () => {
  const box = { x: 100, y: 200, w: 50, h: 20 };

  it('returns the corners of the box, clockwise from top left, under the identity', () => {
    expect(toOriginal(box, identityGeometry({ width: 595, height: 842 }))).toEqual([
      { x: 100, y: 200 },
      { x: 150, y: 200 },
      { x: 150, y: 220 },
      { x: 100, y: 220 },
    ]);
  });

  it('divides by the scale when the page was read larger than the original', () => {
    const geometry = { ...identityGeometry({ width: 595, height: 842 }), scale: 2 };
    expect(toOriginal(box, geometry)).toEqual([
      { x: 50, y: 100 },
      { x: 75, y: 100 },
      { x: 75, y: 110 },
      { x: 50, y: 110 },
    ]);
  });

  it('multiplies back when the page was read smaller than the original', () => {
    const geometry = { ...identityGeometry({ width: 4000, height: 3000 }), scale: 0.5 };
    expect(toOriginal(box, geometry)).toEqual([
      { x: 200, y: 400 },
      { x: 300, y: 400 },
      { x: 300, y: 440 },
      { x: 200, y: 440 },
    ]);
  });

  const near = (points: [number, number][]) =>
    points.map(([x, y]) => ({ x: expect.closeTo(x, 3), y: expect.closeTo(y, 3) }));

  // A 200 × 20 box centred on a 1000 × 800 page: deskewing turned it about that centre.
  const centred = { x: 400, y: 390, w: 200, h: 20 };

  it('turns the box back by +2° about the centre, clockwise with y down', () => {
    const geometry = { ...identityGeometry({ width: 1000, height: 800 }), skewDegrees: 2 };
    // The right end moves down and the left end up: 100 × sin 2° ≈ 3.49 at the middle of each side.
    expect(toOriginal(centred, geometry)).toEqual(
      near([
        [400.40991, 386.51614],
        [600.28808, 393.49604],
        [599.59009, 413.48386],
        [399.71192, 406.50396],
      ]),
    );
  });

  it('turns the box back by −2° the other way', () => {
    const geometry = { ...identityGeometry({ width: 1000, height: 800 }), skewDegrees: -2 };
    expect(toOriginal(centred, geometry)).toEqual(
      near([
        [399.71192, 393.49604],
        [599.59009, 386.51614],
        [600.28808, 406.50396],
        [400.40991, 413.48386],
      ]),
    );
  });

  // A 600 × 800 original. Turned clockwise, its top left corner goes to the top right; twice, to
  // the bottom right; three times, to the bottom left. Each box below is a 10-unit square there.
  it.each([
    [
      1 as const,
      { x: 790, y: 0, w: 10, h: 10 },
      [
        [0, 10],
        [0, 0],
        [10, 0],
        [10, 10],
      ],
    ],
    [
      2 as const,
      { x: 590, y: 790, w: 10, h: 10 },
      [
        [10, 10],
        [0, 10],
        [0, 0],
        [10, 0],
      ],
    ],
    [
      3 as const,
      { x: 0, y: 590, w: 10, h: 10 },
      [
        [10, 0],
        [10, 10],
        [0, 10],
        [0, 0],
      ],
    ],
  ])('undoes %s clockwise quarter turns', (quarterTurns, read, corners) => {
    const geometry = { ...identityGeometry({ width: 600, height: 800 }), quarterTurns };
    expect(toOriginal(read, geometry)).toEqual(near(corners as [number, number][]));
  });

  it('brings a point back through the whole chain: scale, quarter turn, deskew', () => {
    const geometry = {
      width: 2550,
      height: 3300,
      scale: 0.8,
      quarterTurns: 1,
      skewDegrees: 1.5,
    } as const;
    // Forward, as spec §3.2 tells it: scale; turn clockwise; turn by −skew about the read centre.
    const [x, y] = [1000, 2000];
    const [sx, sy] = [x * geometry.scale, y * geometry.scale];
    const [tx, ty] = [geometry.height * geometry.scale - sy, sx];
    const [cx, cy] = [
      (geometry.height * geometry.scale) / 2,
      (geometry.width * geometry.scale) / 2,
    ];
    const angle = (-geometry.skewDegrees * Math.PI) / 180;
    const read = {
      x: cx + (tx - cx) * Math.cos(angle) - (ty - cy) * Math.sin(angle),
      y: cy + (tx - cx) * Math.sin(angle) + (ty - cy) * Math.cos(angle),
      w: 0,
      h: 0,
    };
    expect(toOriginal(read, geometry)).toEqual(near(Array(4).fill([x, y])));
  });
});
