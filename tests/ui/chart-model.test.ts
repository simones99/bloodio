import { describe, expect, it } from 'vitest';
import {
  bandPaths,
  bandShapes,
  buildChartModel,
  calloutPlacement,
  CALLOUT_MIN_ABOVE,
  CHART_MARGIN,
  linePath,
  MIN_X_LABEL_GAP,
  niceStep,
  pickXTicks,
  yDomain,
  type ChartPoint,
} from '../../src/ui/chart/chart-model';
import { formatConvertedNumber, formatMonthLong, formatMonthShort } from '../../src/ui/i18n/it';

const SIZE = { width: 350, height: 200 };

function point(overrides: Partial<ChartPoint> & Pick<ChartPoint, 'date' | 'value'>): ChartPoint {
  return {
    key: overrides.date,
    comparator: null,
    refMin: 0.27,
    refMax: 4.2,
    outOfRange: false,
    ...overrides,
  };
}

describe('formatters', () => {
  it('writes short and long month labels the Italian way', () => {
    expect(formatMonthShort('2021-06-12')).toBe('giu 21');
    expect(formatMonthLong('2021-06-12')).toBe('giugno 2021');
  });

  it('rounds converted numbers to three significant digits, whole numbers from 1000 up', () => {
    expect(formatConvertedNumber(4.99556)).toBe('5');
    expect(formatConvertedNumber(5.4951)).toBe('5,5');
    expect(formatConvertedNumber(90.08)).toBe('90,1');
    expect(formatConvertedNumber(0.012345)).toBe('0,0123');
    expect(formatConvertedNumber(4220000.4)).toBe('4.220.000');
  });
});

describe('niceStep', () => {
  it.each([
    [0.7, 1],
    [1.2, 2],
    [1.69, 2],
    [2.2, 2.5],
    [3, 5],
    [7, 10],
    [0.013, 0.02],
    [130000, 200000],
  ])('rounds %s up to %s', (raw, step) => {
    expect(niceStep(raw)).toBeCloseTo(step, 10);
  });
});

describe('yDomain', () => {
  it('covers every value on round ticks and does not go below zero for positive data', () => {
    const domain = yDomain([5.48, 5.31, 5.07, 0.27, 4.2]);
    expect(domain).toEqual({ min: 0, max: 6, step: 2 });
  });

  it('keeps the tick count small', () => {
    for (const values of [
      [1, 1000],
      [4500000, 5500000, 4220000],
      [0.93, 1.7, 1.4],
      [-3, 12],
    ]) {
      const { min, max, step } = yDomain(values);
      expect(min).toBeLessThanOrEqual(Math.min(...values));
      expect(max).toBeGreaterThanOrEqual(Math.max(...values));
      expect(Math.round((max - min) / step) + 1).toBeLessThanOrEqual(7);
    }
  });

  it('opens a flat series into a visible range', () => {
    const { min, max } = yDomain([5, 5]);
    expect(min).toBeLessThan(5);
    expect(max).toBeGreaterThan(5);
  });
});

describe('buildChartModel', () => {
  const tsh = [
    point({ date: '2021-07-10', value: 5.48, outOfRange: true }),
    point({ date: '2021-08-30', value: 5.72, refMin: 0.25, refMax: 4, outOfRange: true }),
    point({ date: '2022-08-20', value: 5.07, outOfRange: true }),
  ];

  it('steps the band per report: each range holds until the next report, the last to the edge', () => {
    const model = buildChartModel(tsh, SIZE);
    const [a, b, c] = model.segments;
    expect(model.segments).toHaveLength(3);
    expect(a!.x0).toBe(model.points[0]!.x);
    expect(a!.x1).toBe(model.points[1]!.x);
    expect(b!.x1).toBe(model.points[2]!.x);
    expect(c!.x1).toBe(model.plot.right);
    expect(a!.top).toBeCloseTo(model.scaleY(4.2));
    expect(b!.top).toBeCloseTo(model.scaleY(4));
    expect(b!.bottom).toBeCloseTo(model.scaleY(0.25));
  });

  it('runs a "< X" band from the limit down to the bottom edge, without a bottom edge line', () => {
    const model = buildChartModel(
      [
        point({ date: '2025-01-01', value: 142, refMin: null, refMax: 200 }),
        point({ date: '2025-06-01', value: 150, refMin: null, refMax: 200 }),
      ],
      SIZE,
    );
    expect(model.segments[0]).toMatchObject({ hasTop: true, hasBottom: false });
    expect(model.segments[0]!.bottom).toBe(model.plot.bottom);
    const { edges } = bandPaths(model.segments);
    expect(edges).toHaveLength(1);
  });

  it('runs a "> X" band from the limit up to the top edge', () => {
    const model = buildChartModel(
      [
        point({ date: '2025-01-01', value: 36, refMin: 30, refMax: null }),
        point({ date: '2025-06-01', value: 40, refMin: 30, refMax: null }),
      ],
      SIZE,
    );
    expect(model.segments[0]).toMatchObject({ hasTop: false, hasBottom: true });
    expect(model.segments[0]!.top).toBe(model.plot.top);
  });

  it('leaves a hole where a report printed no range, splitting the band in two', () => {
    const model = buildChartModel(
      [
        point({ date: '2025-01-01', value: 3 }),
        point({ date: '2025-03-01', value: 3, refMin: null, refMax: null, outOfRange: null }),
        point({ date: '2025-06-01', value: 3 }),
      ],
      SIZE,
    );
    expect(model.segments).toHaveLength(2);
    expect(bandPaths(model.segments).fills).toHaveLength(2);
  });

  it('keeps contiguous segments in one polygon', () => {
    const model = buildChartModel(tsh, SIZE);
    const { fills, edges } = bandPaths(model.segments);
    expect(fills).toHaveLength(1);
    expect(edges).toHaveLength(2);
    expect(fills[0]).toMatch(/^M[\d. L]+Z$/);
  });

  it('places two reports from the same day on the same x without zero-width segments or NaN', () => {
    const model = buildChartModel(
      [
        point({ date: '2025-01-01', value: 3 }),
        point({ date: '2025-01-01', value: 3.5 }),
        point({ date: '2025-06-01', value: 4 }),
      ],
      SIZE,
    );
    expect(model.points[0]!.x).toBe(model.points[1]!.x);
    for (const s of model.segments) expect(s.x1).toBeGreaterThan(s.x0);
    for (const p of model.points) expect(Number.isFinite(p.x) && Number.isFinite(p.y)).toBe(true);
    expect(linePath(model.points)).not.toContain('NaN');
  });

  it('handles every report on a single day', () => {
    const model = buildChartModel(
      [point({ date: '2025-01-01', value: 3 }), point({ date: '2025-01-01', value: 4 })],
      SIZE,
    );
    for (const p of model.points) expect(Number.isFinite(p.x)).toBe(true);
  });

  it('shapes points like the rail: out of range wins over a comparator', () => {
    const model = buildChartModel(
      [
        point({ date: '2025-01-01', value: 3 }),
        point({ date: '2025-02-01', value: 3, comparator: '<' }),
        point({ date: '2025-03-01', value: 9, comparator: '>', outOfRange: true }),
        point({ date: '2025-04-01', value: 3, refMin: null, refMax: null, outOfRange: null }),
      ],
      SIZE,
    );
    expect(model.points.map((p) => p.shape)).toEqual(['in', 'open', 'out', 'in']);
    expect(model.points.map((p) => p.latest)).toEqual([false, false, false, true]);
  });

  it('sorts points by date whatever the input order', () => {
    const model = buildChartModel([...tsh].reverse(), SIZE);
    expect(model.points.map((p) => p.key)).toEqual(['2021-07-10', '2021-08-30', '2022-08-20']);
  });

  it('widens the left margin for long y labels such as millions', () => {
    const rbc = [
      point({ date: '2021-10-04', value: 5_000_000, refMin: 4_500_000, refMax: 5_500_000 }),
      point({ date: '2022-08-20', value: 4_880_000, refMin: 4_500_000, refMax: 5_500_000 }),
    ];
    const model = buildChartModel(rbc, SIZE);
    const longest = Math.max(...model.yTicks.map((t) => t.label.length));
    expect(model.plot.left).toBeGreaterThanOrEqual(longest * 6 + 8);
    expect(buildChartModel(tsh, SIZE).plot.left).toBe(CHART_MARGIN.left);
  });

  it('labels the y axis on round numbers', () => {
    const model = buildChartModel(tsh, SIZE);
    expect(model.yTicks.map((t) => t.label)).toEqual(['0', '2', '4', '6', '8']);
  });

  it('places the "range stampato" label inside a tall enough band, and drops it when the band is thin', () => {
    expect(buildChartModel(tsh, SIZE).bandLabel).not.toBeNull();
    const thin = buildChartModel(
      [
        point({ date: '2025-01-01', value: 100, refMin: 4.9, refMax: 5.1 }),
        point({ date: '2025-06-01', value: 0, refMin: 4.9, refMax: 5.1 }),
      ],
      SIZE,
    );
    expect(thin.bandLabel).toBeNull();
  });
});

describe('pickXTicks', () => {
  it('keeps first and last, and the middle labels that do not collide', () => {
    const ticks = pickXTicks([
      { position: 50, label: 'giu 21' },
      { position: 70, label: 'lug 21' },
      { position: 160, label: 'ago 21' },
      { position: 250, label: 'ott 21' },
      { position: 330, label: 'ago 22' },
    ]);
    expect(ticks.map((t) => t.label)).toEqual(['giu 21', 'ago 21', 'ott 21', 'ago 22']);
    for (let i = 1; i < ticks.length; i++) {
      expect(ticks[i]!.position - ticks[i - 1]!.position).toBeGreaterThanOrEqual(MIN_X_LABEL_GAP);
    }
  });

  it('keeps only the last label when first and last collide', () => {
    expect(
      pickXTicks([
        { position: 100, label: 'giu 21' },
        { position: 120, label: 'lug 21' },
      ]).map((t) => t.label),
    ).toEqual(['lug 21']);
  });

  it('never repeats the same month label', () => {
    expect(
      pickXTicks([
        { position: 50, label: 'giu 21' },
        { position: 200, label: 'giu 21' },
        { position: 330, label: 'lug 21' },
      ]).map((t) => t.label),
    ).toEqual(['giu 21', 'lug 21']);
  });
});

describe('calloutPlacement', () => {
  const size = { width: 350, height: 200 };

  it('centers the box over a point in the middle, above it', () => {
    expect(calloutPlacement({ x: 175, y: 160 }, size)).toEqual({
      left: 175,
      top: 146,
      align: 'center',
      side: 'above',
    });
  });

  it('anchors the box to the point near either edge so it stays inside the chart', () => {
    expect(calloutPlacement({ x: 60, y: 160 }, size).align).toBe('start');
    expect(calloutPlacement({ x: 320, y: 160 }, size).align).toBe('end');
  });

  it('keeps the box clear of the chart top: room for its whole height is needed above', () => {
    expect(CALLOUT_MIN_ABOVE).toBeGreaterThanOrEqual(140);
  });

  it('puts the box below a point too close to the top', () => {
    const placement = calloutPlacement({ x: 175, y: CALLOUT_MIN_ABOVE - 1 }, size);
    expect(placement.side).toBe('below');
    expect(placement.top).toBe(CALLOUT_MIN_ABOVE - 1 + 14);
  });
});

describe('bandShapes', () => {
  it('returns the same geometry bandPaths writes as SVG', () => {
    const model = buildChartModel(
      [
        point({ date: '2025-01-01', value: 3 }),
        point({ date: '2025-03-01', value: 3, refMin: null, refMax: null, outOfRange: null }),
        point({ date: '2025-06-01', value: 3, refMin: null, refMax: 4 }),
      ],
      SIZE,
    );
    const shapes = bandShapes(model.segments);
    const paths = bandPaths(model.segments);
    expect(shapes.fills).toHaveLength(paths.fills.length);
    expect(shapes.edges).toHaveLength(paths.edges.length);
    expect(shapes.fills[0]).toHaveLength(4);
  });
});
