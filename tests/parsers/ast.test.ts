import { describe, expect, it } from 'vitest';
import { astDate, astLabName, detectAst, parseAstRows } from '../../src/parsers/ast';
import { rowOcrConfidence } from '../../src/ocr/row-confidence';
import type { PositionedText, TextItem } from '../../src/parsers/types';
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

describe('AST Vallerosa adapter: a reference line continuing below the row', () => {
  const word = (text: string, x: number, y: number, w: number, confidence = 0.99): TextItem => ({
    text,
    x,
    y,
    w,
    h: 10,
    confidence,
  });
  // The row itself has no reference: the reference line below, read badly, is attached to it.
  const pt: PositionedText = {
    source: 'ocr',
    pages: [
      {
        width: 600,
        height: 400,
        items: [
          word('Esame', 10, 100, 40),
          word('Esito', 200, 100, 30),
          word('U.M.', 300, 100, 30),
          word('Val. riferimento', 400, 100, 100),
          word('Glicemia', 10, 130, 80),
          word('87', 200, 130, 20),
          word('mg/dL', 300, 130, 40),
          word('70 - 110', 400, 142, 60, 0.3),
        ],
      },
    ],
  };

  it('grows the row box to hold the attached line, so its confidence counts', () => {
    const [glucose] = parseAstRows(pt);
    expect(glucose).toMatchObject({ name: 'Glicemia', ref: '70 - 110' });
    expect(glucose!.bbox).toEqual({ x: 10, y: 120, w: 450, h: 22 });
    expect(rowOcrConfidence(glucose!.bbox, pt.pages[0])).toBe(0.3);
  });
});
