import { describe, expect, it } from 'vitest';
import {
  chooseDotMode,
  isAmbiguousNumber,
  numberTokens,
  parseItalianNumber,
  parseValue,
} from '../../src/domain/numbers';

describe('parseItalianNumber', () => {
  it.each([
    ['13,8', 13.8],
    ['33,40', 33.4],
    ['95', 95],
    ['1900', 1900],
    ['4.220.000', 4220000],
    ['7.510', 7510],
    ['1.234,5', 1234.5],
  ])('reads %s as %d', (text, expected) => {
    expect(parseItalianNumber(text)).toBe(expected);
  });

  it('reads an ambiguous token as a decimal when asked', () => {
    expect(parseItalianNumber('1.029', 'decimal')).toBe(1.029);
  });

  it.each(['Assente', '.', '', '12a', '1,2,3x'])('returns null for %j', (text) => {
    expect(parseItalianNumber(text)).toBeNull();
  });
});

describe('isAmbiguousNumber', () => {
  it.each(['7.510', '1.029', '4.220.000'])('%s is ambiguous', (t) => {
    expect(isAmbiguousNumber(t)).toBe(true);
  });
  it.each(['11,30', '1900', '1.02', '1.0260'])('%s is not ambiguous', (t) => {
    expect(isAmbiguousNumber(t)).toBe(false);
  });
});

describe('parseValue', () => {
  it('parses a plain value', () => {
    expect(parseValue(' 5,07 ')).toEqual({ value: 5.07, comparator: null, valueText: '5,07' });
  });
  it('parses a comparator', () => {
    expect(parseValue('<10')).toEqual({ value: 10, comparator: '<', valueText: '<10' });
    expect(parseValue('>= 1,5')).toEqual({ value: 1.5, comparator: '>=', valueText: '>= 1,5' });
  });
  it('keeps qualitative text', () => {
    expect(parseValue('Paglierino')).toEqual({
      value: null,
      comparator: null,
      valueText: 'Paglierino',
    });
  });
});

describe('numberTokens', () => {
  it('extracts every number of a reference text', () => {
    expect(numberTokens('da 1.007 a 1.035')).toEqual(['1.007', '1.035']);
    expect(numberTokens('< 6')).toEqual(['6']);
    expect(numberTokens('Assente')).toEqual([]);
  });
});

describe('chooseDotMode', () => {
  it('has nothing to decide without ambiguous tokens', () => {
    expect(chooseDotMode(['13,8', 'da 13 a 17'])).toEqual({ mode: 'thousands', ambiguous: false });
  });
  it('uses the plausible range: white cells 7.510 /µL are thousands', () => {
    expect(chooseDotMode(['7.510', 'da 4.000 a 10.000'], { min: 500, max: 100000 })).toEqual({
      mode: 'thousands',
      ambiguous: false,
    });
  });
  it('uses the plausible range: urine specific gravity 1.029 is a decimal', () => {
    expect(chooseDotMode(['1.029', 'da 1.007 a 1.035'], { min: 1, max: 1.06 })).toEqual({
      mode: 'decimal',
      ambiguous: false,
    });
  });
  it('falls back to unambiguous numbers of the same row', () => {
    // plausible 0..50000 accepts both 2410 and 2.41; the printed range 1000..4000 settles it
    expect(chooseDotMode(['2.410', 'da 1000 a 4000'], { min: 0, max: 50000 })).toEqual({
      mode: 'thousands',
      ambiguous: false,
    });
  });
  it('applies the unit factor before checking plausibility', () => {
    // 7.510 printed in 10^3/µL would be 7.51 × 1000 = 7510 /µL: decimal reading is the plausible one
    expect(chooseDotMode(['7.510'], { min: 500, max: 100000 }, 1000)).toEqual({
      mode: 'decimal',
      ambiguous: false,
    });
  });
  it('reports ambiguity when nothing settles it', () => {
    expect(chooseDotMode(['1.029', 'da 1.007 a 1.035'])).toEqual({
      mode: 'thousands',
      ambiguous: true,
    });
  });
});
