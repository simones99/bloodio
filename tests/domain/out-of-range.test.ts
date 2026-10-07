import { describe, expect, it } from 'vitest';
import { computeOutOfRange, type RangeInput } from '../../src/domain/out-of-range';

const base: RangeInput = {
  value: null,
  comparator: null,
  valueText: '',
  refMin: null,
  refMax: null,
  refText: null,
};
const numeric = (value: number, refMin: number | null, refMax: number | null): RangeInput => ({
  ...base,
  value,
  valueText: String(value),
  refMin,
  refMax,
  refText: 'printed',
});

describe('computeOutOfRange: numeric', () => {
  it('is false inside the range, limits included', () => {
    expect(computeOutOfRange(numeric(13.8, 13, 17))).toBe(false);
    expect(computeOutOfRange(numeric(13, 13, 17))).toBe(false);
    expect(computeOutOfRange(numeric(17, 13, 17))).toBe(false);
  });
  it('is true outside the range', () => {
    expect(computeOutOfRange(numeric(5.07, 0.27, 4.2))).toBe(true);
    expect(computeOutOfRange(numeric(36.4, 40, 75))).toBe(true);
  });
  it('handles one-sided ranges', () => {
    expect(computeOutOfRange(numeric(7.8, null, 6))).toBe(true);
    expect(computeOutOfRange(numeric(1.7, null, 2))).toBe(false);
    expect(computeOutOfRange(numeric(65.8, 30, null))).toBe(false);
    expect(computeOutOfRange(numeric(28.8, 30, null))).toBe(true);
  });
  it('is null without any limit', () => {
    expect(computeOutOfRange(numeric(5, null, null))).toBeNull();
  });
});

describe('computeOutOfRange: comparators', () => {
  const lt = (value: number, refMin: number | null, refMax: number | null): RangeInput => ({
    ...numeric(value, refMin, refMax),
    comparator: '<',
    valueText: `<${value}`,
  });
  const gt = (value: number, refMin: number | null, refMax: number | null): RangeInput => ({
    ...numeric(value, refMin, refMax),
    comparator: '>',
    valueText: `>${value}`,
  });
  it('"<10" against "< 20" is in range', () => {
    expect(computeOutOfRange(lt(10, null, 20))).toBe(false);
  });
  it('"<10" against "< 5" cannot be decided', () => {
    expect(computeOutOfRange(lt(10, null, 5))).toBeNull();
  });
  it('"<10" against "da 12 a 20" is below the range', () => {
    expect(computeOutOfRange(lt(10, 12, 20))).toBe(true);
  });
  it('"<15" against "da 10 a 20" cannot be decided', () => {
    expect(computeOutOfRange(lt(15, 10, 20))).toBeNull();
  });
  it('">100" against "< 50" is above the range', () => {
    expect(computeOutOfRange(gt(100, null, 50))).toBe(true);
  });
  it('">100" against "> 30" is in range', () => {
    expect(computeOutOfRange(gt(100, 30, null))).toBe(false);
  });
});

describe('computeOutOfRange: qualitative', () => {
  const q = (
    valueText: string,
    refText: string | null,
    refMax: number | null = null,
  ): RangeInput => ({
    ...base,
    valueText,
    refText,
    refMax,
  });
  it('treats "Assenti" and "Assente" as the same', () => {
    expect(computeOutOfRange(q('Assenti', 'Assente'))).toBe(false);
    expect(computeOutOfRange(q('Negativo', 'Assente'))).toBe(false);
  });
  it('"Assente" against "Fino a 20" is in range', () => {
    expect(computeOutOfRange(q('Assente', 'Fino a 20', 20))).toBe(false);
  });
  it('anything else against "Assente" is out of range', () => {
    expect(computeOutOfRange(q('Tracce', 'Assente'))).toBe(true);
    expect(computeOutOfRange(q('Presenti', 'Assente'))).toBe(true);
  });
  it('equal texts are in range', () => {
    expect(computeOutOfRange(q('Limpido', 'limpido'))).toBe(false);
  });
  it('is null when it cannot compare', () => {
    expect(computeOutOfRange(q('Paglierino', null))).toBeNull();
    expect(computeOutOfRange(q('Rare', 'Alcune'))).toBeNull();
    expect(computeOutOfRange(q('', 'Assente'))).toBeNull();
  });
});
