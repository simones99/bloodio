import { describe, expect, it } from 'vitest';
import { astDate, astLabName, detectAst, parseAstRows } from '../../src/parsers/ast';
import type { PositionedText } from '../../src/parsers/types';
import { loadFixture } from '../fixtures/load';

describe('AST adapter', () => {
  const fixture = loadFixture('ast-2021-08-30');

  it('detects its own layout and not PROAVIS', () => {
    expect(detectAst(fixture)).toBe(1);
    expect(detectAst(loadFixture('proavis-2022-08-20'))).toBe(0);
  });
  it('names the lab after the town in the letterhead', () => {
    expect(astLabName(fixture)).toBe('AST Vallerosa');
    const withTown = (header: string): PositionedText => ({
      ...fixture,
      pages: fixture.pages.map((page) => ({
        ...page,
        items: page.items.map((i) =>
          /^Azienda Sanitaria Territoriale/i.test(i.text) ? { ...i, text: header } : i,
        ),
      })),
    });
    expect(astLabName(withTown('Azienda Sanitaria Territoriale - PESARO URBINO'))).toBe(
      'AST Pesaro Urbino',
    );
    expect(astLabName(withTown('Azienda Sanitaria Territoriale'))).toBe('AST');
  });
  it('reads the check-in date as sample date', () => {
    expect(astDate(fixture)).toBe('2021-08-30');
  });
  it('never guesses the sample date without the Check-in label (would pick the birth date)', () => {
    const withoutCheckIn: PositionedText = {
      ...fixture,
      pages: fixture.pages.map((page) => ({
        ...page,
        items: page.items.filter((i) => !/^Check-in:?$/i.test(i.text.trim())),
      })),
    };
    expect(astDate(withoutCheckIn)).toBeNull();
  });
  it('reads both rows with the two-line age-stratified reference', () => {
    const rows = parseAstRows(fixture);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      name: 'TSH',
      value: '4,30',
      unit: 'micro U.I./ml',
      ref: 'Fino a 10 anni: da 0,35 a 5,8\nDa 11 anni in poi: da 0,25 a 4',
      section: 'TIREOTROPINA - TSH - Test riflesso',
    });
    expect(rows[1]).toMatchObject({
      name: 'FT4',
      value: '7,1',
      unit: 'pg/ml',
      ref: 'Fino a 10 anni: da 5,6 a 12,2\nDa 11 anni in poi: da 5,4 a 12,6',
    });
  });
  it('ignores the header block and the signature lines', () => {
    const names = parseAstRows(fixture).map((r) => r.name);
    expect(names).toEqual(['TSH', 'FT4']);
  });
});
