import { describe, expect, it } from 'vitest';
import { railPosition } from '../../src/ui/components/rail-position';

describe('railPosition', () => {
  it('places an in-range value on the track', () => {
    expect(railPosition(15, 13, 17)).toEqual({ x: 50, state: 'in' });
    expect(railPosition(13, 13, 17)).toEqual({ x: 20, state: 'in' });
    expect(railPosition(17, 13, 17)).toEqual({ x: 80, state: 'in' });
  });
  it('places out-of-range values beyond the ends, compressed', () => {
    const tsh = railPosition(5.07, 0.27, 4.2)!;
    expect(tsh.state).toBe('above');
    expect(tsh.x).toBeCloseTo(88.85, 1);
    expect(railPosition(1000, 0.27, 4.2)).toEqual({ x: 96, state: 'above' });
    const low = railPosition(36.4, 40, 75)!;
    expect(low.state).toBe('below');
    expect(low.x).toBeCloseTo(15.89, 1);
  });
  it('draws "< X" ranges from zero', () => {
    expect(railPosition(3, null, 6)).toEqual({ x: 50, state: 'in' });
    expect(railPosition(7.8, null, 6)?.state).toBe('above');
  });
  it('draws "> X" ranges with room above the limit', () => {
    expect(railPosition(65.8, 30, null)?.state).toBe('in');
    expect(railPosition(28.8, 30, null)?.state).toBe('below');
  });
  it('has nothing to draw without a range', () => {
    expect(railPosition(5, null, null)).toBeNull();
    expect(railPosition(5, 4, 4)).toBeNull();
  });
});
