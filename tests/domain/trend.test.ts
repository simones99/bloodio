import { describe, expect, it } from 'vitest';
import { limitDistance, watchSide, type TrendPoint } from '../../src/domain/trend';

const p = (value: number, refMin: number | null, refMax: number | null): TrendPoint => ({
  value,
  refMin,
  refMax,
});

describe('watchSide', () => {
  it('needs at least two points', () => {
    expect(watchSide([p(43, 20, 45)])).toBeNull();
  });
  it('flags a value near the upper limit and rising (lymphocytes 38,6 -> 43,1 in 20..45)', () => {
    expect(watchSide([p(38.6, 20, 45), p(43.1, 20, 45)])).toBe('upper');
  });
  it('does not flag a value near the upper limit but falling', () => {
    expect(watchSide([p(44.5, 20, 45), p(43.1, 20, 45)])).toBeNull();
  });
  it('flags a value near the lower limit and falling', () => {
    expect(watchSide([p(45.3, 40, 75), p(41.2, 40, 75)])).toBe('lower');
  });
  it('does not flag values in the middle of the range', () => {
    expect(watchSide([p(15.1, 13, 17), p(15.3, 13, 17)])).toBeNull();
  });
  it('never flags a value already out of range', () => {
    expect(watchSide([p(43, 20, 45), p(46, 20, 45)])).toBeNull();
  });
  it('handles "< X" ranges (triglycerides 82 -> 143 with < 150)', () => {
    expect(watchSide([p(82, null, 150), p(143, null, 150)])).toBe('upper');
    expect(watchSide([p(82, null, 150), p(100, null, 150)])).toBeNull();
  });
  it('handles "> X" ranges (vitamin D 36 -> 32 with > 30)', () => {
    expect(watchSide([p(36, 30, null), p(32, 30, null)])).toBe('lower');
    expect(watchSide([p(32, 30, null), p(34, 30, null)])).toBeNull();
  });
  it('uses the range of the latest report', () => {
    expect(watchSide([p(30, null, 34), p(18, null, 20)])).toBeNull(); // falling
    expect(watchSide([p(10, null, 34), p(18, null, 20)])).toBe('upper');
  });
  it('is null without a range', () => {
    expect(watchSide([p(1, null, null), p(2, null, null)])).toBeNull();
  });
});

describe('limitDistance', () => {
  it('measures a two-sided range in spans, from the nearest limit', () => {
    expect(limitDistance(130, 70, 110)).toBeCloseTo(0.5); // above
    expect(limitDistance(50, 70, 110)).toBeCloseTo(0.5); // below
    expect(limitDistance(105, 70, 110)).toBeCloseTo(0.125); // inside, near the upper limit
    expect(limitDistance(72, 70, 110)).toBeCloseTo(0.05); // inside, near the lower limit
  });

  it('measures a one-sided range relative to its limit', () => {
    expect(limitDistance(8, null, 6)).toBeCloseTo(1 / 3); // "< 6", above
    expect(limitDistance(5.4, null, 6)).toBeCloseTo(0.1); // "< 6", inside
    expect(limitDistance(30, 40, null)).toBeCloseTo(0.25); // "> 40", below
  });

  it('has no distance without a usable range', () => {
    expect(limitDistance(5, null, null)).toBeNull();
    expect(limitDistance(5, 4, 4)).toBeNull();
    expect(limitDistance(5, 6, 4)).toBeNull();
    expect(limitDistance(5, null, 0)).toBeNull();
  });
});
