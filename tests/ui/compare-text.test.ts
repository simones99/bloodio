import { describe, expect, it } from 'vitest';
import { formatDelta, rowNotes, spokenRow } from '../../src/ui/compare/compare-text';
import { compare, CUSTOM, glucose, homocysteine, rowOf, tsh } from './compare-fixtures';

describe('formatDelta', () => {
  it('keeps the decimals of the more precise printed value, with an explicit sign', () => {
    const absolute = 5.07 - 5.31;
    expect(formatDelta({ absolute, percent: (absolute / 5.31) * 100, decimals: 2 })).toEqual([
      '−0,24',
      '−5%',
    ]);
    expect(formatDelta({ absolute: 12, percent: (12 / 92) * 100, decimals: 0 })).toEqual([
      '+12',
      '+13%',
    ]);
  });

  it('rounds a converted difference to three significant digits', () => {
    expect(formatDelta({ absolute: 0.6666, percent: 13.1, decimals: null })).toEqual([
      '+0,667',
      '+13%',
    ]);
  });

  it('treats floating-point noise in a converted difference as unchanged, never as "+0"', () => {
    expect(formatDelta({ absolute: 3e-12, percent: 0, decimals: null })).toEqual(['invariato']);
    expect(formatDelta({ absolute: 0.0004, percent: 1, decimals: null })).toEqual([
      '+0,0004',
      '+1%',
    ]);
  });

  it('drops trailing zeros like the values it compares ("29,20 → 29,10")', () => {
    const absolute = 29.1 - 29.2;
    expect(formatDelta({ absolute, percent: (absolute / 29.2) * 100, decimals: 2 })).toEqual([
      '−0,1',
      '< 1%',
    ]);
  });

  it('says "invariato" when the difference rounds to zero', () => {
    expect(formatDelta({ absolute: 0.001, percent: 0.02, decimals: 2 })).toEqual(['invariato']);
    expect(formatDelta({ absolute: 0, percent: 0, decimals: null })).toEqual(['invariato']);
  });

  it('writes "< 1%" for a small change and has no percentage from zero', () => {
    expect(formatDelta({ absolute: 1, percent: 0.2, decimals: 0 })).toEqual(['+1', '< 1%']);
    expect(formatDelta({ absolute: 3, percent: null, decimals: 0 })).toEqual(['+3']);
  });
});

describe('rowNotes', () => {
  it('colours only the change of side', () => {
    const view = compare([glucose(92), tsh(5.07)], [glucose(104), tsh(2)]);
    expect(rowNotes(rowOf(view, 'glucose#0'))).toEqual([
      { text: '↑ ora sopra', spoken: 'ora sopra il range', tone: 'out' },
    ]);
    expect(rowNotes(rowOf(view, 'tsh#0'))).toEqual([
      { text: 'ora nel range', spoken: 'ora nel range', tone: 'in' },
    ]);
  });
});

describe('spokenRow', () => {
  it('says the values, the change of side and the difference', () => {
    const view = compare([glucose(92)], [glucose(104)]);
    expect(spokenRow(rowOf(view, 'glucose#0'))).toBe(
      'Glicemia, da 92 a 104 mg/dL, ora sopra il range, più 12, più 13%',
    );
  });

  it('speaks a negative difference with words, not the minus sign', () => {
    const view = compare([tsh(5.31)], [tsh(5.07)]);
    expect(spokenRow(rowOf(view, 'tsh#0'))).toBe('TSH, da 5,31 a 5,07 µUI/mL, meno 0,24, meno 5%');
  });

  it('says which report holds an entry measured once', () => {
    expect(spokenRow(rowOf(compare([tsh(5.31)], []), 'tsh#0'))).toBe(
      'TSH, 5,31 µUI/mL, solo nel referto del 4 ott 2021',
    );
  });

  it('gives both units when they cannot be converted', () => {
    const view = compare([homocysteine(9, 'µmol/L')], [homocysteine(1.2, 'mg/L')], {
      custom: CUSTOM,
    });
    expect(spokenRow(rowOf(view, 'custom:c1#0'))).toBe(
      'Omocisteina, da 9 µmol/L a 1,2 mg/L, unità diverse, non confrontabili',
    );
  });

  it('explains a missing difference and a changed range', () => {
    const view = compare(
      [
        tsh(9, {
          comparator: '<',
          valueText: '<9',
          refMin: null,
          refMax: 20,
          refText: '< 20',
          outOfRange: false,
        }),
      ],
      [tsh(12, { refMin: null, refMax: 15, refText: '< 15', outOfRange: false })],
    );
    expect(spokenRow(rowOf(view, 'tsh#0'))).toBe(
      'TSH, da <9 a 12 µUI/mL, il valore precedente è un limite, nessuna differenza, range cambiato: < 20 → < 15',
    );
  });
});
