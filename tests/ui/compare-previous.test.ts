import { describe, expect, it } from 'vitest';
import { chronological, previousComparable, sharedCount } from '../../src/ui/compare/previous';
import { refsOf, report } from './compare-fixtures';

const april = report('apr', '2022-08-20');
const december = report('dec', '2021-10-04');
const may = report('may', '2021-07-10');
const all = [april, december, may];

describe('previousComparable', () => {
  it('picks the closest earlier report with an entry in common', () => {
    const refs = refsOf({ apr: ['tsh', 'glucose'], dec: ['glucose'], may: ['tsh'] });
    expect(previousComparable(april, all, refs)?.id).toBe('dec');
  });

  it('skips earlier reports with nothing in common', () => {
    const refs = refsOf({ apr: ['tsh'], dec: ['glucose'], may: ['tsh'] });
    expect(previousComparable(april, all, refs)?.id).toBe('may');
  });

  it('has nothing for the oldest report, without a match, or for a report with no entries', () => {
    expect(
      previousComparable(may, all, refsOf({ apr: ['tsh'], dec: ['tsh'], may: ['tsh'] })),
    ).toBeNull();
    expect(previousComparable(april, all, refsOf({ apr: ['tsh'], dec: ['ft4'] }))).toBeNull();
    expect(previousComparable(april, all, refsOf({ dec: ['tsh'] }))).toBeNull();
  });

  it('orders reports of the same day by creation time', () => {
    const morning = report('morning', '2022-08-20', '2022-08-20T08:00:00.000Z');
    const evening = report('evening', '2022-08-20', '2022-08-20T18:00:00.000Z');
    const refs = refsOf({ morning: ['tsh'], evening: ['tsh'] });
    expect(previousComparable(evening, [morning, evening], refs)?.id).toBe('morning');
    expect(previousComparable(morning, [morning, evening], refs)).toBeNull();
  });

  it('matches custom entries by their key', () => {
    const refs = refsOf({ apr: ['custom:c1'], dec: ['custom:c2'], may: ['custom:c1'] });
    expect(previousComparable(april, all, refs)?.id).toBe('may');
  });
});

describe('chronological', () => {
  it('puts the older report first whatever the order received', () => {
    expect(chronological(april, december).map((r) => r.id)).toEqual(['dec', 'apr']);
    expect(chronological(december, april).map((r) => r.id)).toEqual(['dec', 'apr']);
  });
});

describe('sharedCount', () => {
  it('counts the entries two reports have in common', () => {
    expect(sharedCount(new Set(['tsh', 'ft4']), new Set(['ft4', 'glucose']))).toBe(1);
    expect(sharedCount(new Set(['tsh']), undefined)).toBe(0);
    expect(sharedCount(undefined, new Set(['tsh']))).toBe(0);
  });
});
