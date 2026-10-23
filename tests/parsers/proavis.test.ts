import { describe, expect, it } from 'vitest';
import { detectProavis, parseProavisRows, proavisDate } from '../../src/parsers/proavis';
import { rowOcrConfidence } from '../../src/ocr/row-confidence';
import type { PositionedText, TextItem } from '../../src/parsers/types';
import { loadFixture } from '../fixtures/load';

const row = (rows: ReturnType<typeof parseProavisRows>, name: string, section?: string) =>
  rows.find((r) => r.name === name && (section === undefined || r.section === section));

describe('PROAVIS adapter: detection and date', () => {
  it.each(['proavis-2022-08-20', 'proavis-2021-10-04', 'proavis-2021-07-10'] as const)(
    'detects %s',
    (name) => {
      expect(detectProavis(loadFixture(name))).toBeGreaterThanOrEqual(0.7);
    },
  );
  it('does not detect another lab', () => {
    expect(detectProavis(loadFixture('ast-2021-08-30'))).toBeLessThan(0.5);
  });
  it('reads the sample date next to the town', () => {
    expect(proavisDate(loadFixture('proavis-2022-08-20'))).toBe('2022-08-20');
    expect(proavisDate(loadFixture('proavis-2021-10-04'))).toBe('2021-10-04');
    expect(proavisDate(loadFixture('proavis-2021-07-10'))).toBe('2021-07-10');
  });
  it('reads the date whatever the town, including multi-word names', () => {
    const withTown = (town: string): PositionedText => {
      const fixture = loadFixture('proavis-2022-08-20');
      return {
        ...fixture,
        pages: fixture.pages.map((page) => ({
          ...page,
          items: page.items.map((i) => ({
            ...i,
            text: i.text.replace(/^Vallerosa(?=,)/, town),
          })),
        })),
      };
    };
    expect(proavisDate(withTown('Ancona'))).toBe('2022-08-20');
    expect(proavisDate(withTown("Porto Sant'Elpidio"))).toBe('2022-08-20');
  });
});

describe('PROAVIS adapter: rows of the 20/08/2022 report', () => {
  const rows = parseProavisRows(loadFixture('proavis-2022-08-20'));

  it('finds all 25 rows and no headings', () => {
    expect(rows).toHaveLength(25);
    expect(rows.map((r) => r.name)).not.toContain('EMATOLOGIA');
    expect(rows.map((r) => r.name)).not.toContain('FORMULA LEUCOCITARIA');
  });
  it('joins name, value, reference and unit printed on slightly different baselines', () => {
    expect(row(rows, 'Globuli rossi')).toMatchObject({
      value: '4.220.000',
      unit: '/μl',
      ref: 'da 4.500.000 a 5.500.000',
      section: 'EMOCROMO',
      page: 0,
    });
    expect(row(rows, 'Linfociti')).toMatchObject({ value: '32,1', unit: '%', ref: 'da 20 a 45' });
    expect(row(rows, 'TSH')).toMatchObject({
      value: '5,07',
      unit: 'μUI/ml',
      ref: 'da 0,27 a 4,20',
      section: 'MONITORAGGIO TIROIDE',
    });
  });
  it('keeps the box of the value alone, for the opening of "Vedi originale"', () => {
    // The "5,07" printed at x 219.2, 19.5 wide, baseline 501.6, 10 high: the value ends at 238.7.
    expect(row(rows, 'TSH')?.valueBox).toEqual({
      x: 219.2,
      y: expect.closeTo(491.6, 6),
      w: 19.5,
      h: expect.closeTo(10, 6),
    });
  });
  it('keeps percentage and absolute counts as separate rows', () => {
    expect(row(rows, 'Neutrofili')).toMatchObject({ value: '55,2', unit: '%' });
    expect(row(rows, 'NEUTROFILI')).toMatchObject({
      value: '4.140',
      unit: '/μl',
      ref: 'da 1900 a 7700',
    });
  });
  it('keeps comparators in the value', () => {
    expect(row(rows, 'Anticorpi anti Tireoperossidasi')).toMatchObject({
      value: '<10',
      ref: '< 20',
    });
  });
  it('never puts the method column into a row', () => {
    for (const r of rows)
      expect(`${r.value} ${r.unit} ${r.ref}`).not.toMatch(/CITOFLUORIM|LUMINESC|ECLIA/);
  });
  it('gives every row a bounding box on the page', () => {
    for (const r of rows) {
      expect(r.bbox.w).toBeGreaterThan(0);
      expect(r.bbox.h).toBeGreaterThan(0);
    }
  });
});

describe('PROAVIS adapter: mis-columned value (OCR loses the number)', () => {
  it('keeps TSH as a row with an empty value instead of turning it into a heading', () => {
    const fixture = loadFixture('proavis-2022-08-20');
    const withoutTshValue: PositionedText = {
      ...fixture,
      pages: fixture.pages.map((page) => ({
        ...page,
        items: page.items.filter((i) => i.text.trim() !== '5,07'),
      })),
    };
    const rows = parseProavisRows(withoutTshValue);
    expect(rows).toHaveLength(25);
    expect(row(rows, 'TSH')).toMatchObject({ value: '', section: 'MONITORAGGIO TIROIDE' });
    expect(row(rows, 'TSH')?.valueBox).toBeUndefined();
    expect(row(rows, 'FT4')).toMatchObject({ section: 'MONITORAGGIO TIROIDE' });
  });
});

describe('PROAVIS adapter: rows of the two-page 04/10/2021 report', () => {
  const rows = parseProavisRows(loadFixture('proavis-2021-10-04'));

  it('finds all 49 rows across both pages', () => {
    expect(rows).toHaveLength(49);
    expect(rows.filter((r) => r.page === 1)).toHaveLength(22);
  });
  it('attaches reference lines that continue below the row', () => {
    expect(row(rows, 'Vitamina D (25 OH)')).toMatchObject({
      value: '65,8',
      unit: 'ng/ml',
      ref: '4-10 Carenza grave\n10-30 Carenza moderata\n> 30 Normale',
    });
  });
  it('reads qualitative urine rows under their own section', () => {
    expect(row(rows, 'Emoglobina', 'ESAME CHIMICO FISICO URINE')).toMatchObject({
      value: 'Assente',
      unit: '',
      ref: 'Assente',
    });
    expect(row(rows, 'Emoglobina', 'EMOCROMO')).toMatchObject({ value: '13,8', unit: 'g/dl' });
    expect(row(rows, 'Colore')).toMatchObject({ value: 'Giallo ambrato', ref: '' });
    expect(row(rows, 'Peso specifico')).toMatchObject({ value: '1.029', ref: 'da 1.007 a 1.035' });
  });
  it('treats "ESAME DEL SEDIMENTO ." as a heading, not a row', () => {
    expect(row(rows, 'ESAME DEL SEDIMENTO')).toBeUndefined();
    expect(row(rows, 'Cristalli')).toMatchObject({
      value: 'Rari, di fosfato triplo',
      section: 'ESAME DEL SEDIMENTO',
    });
  });
});

describe('PROAVIS adapter: rows of the 10/07/2021 report', () => {
  it('reads the six thyroid rows with their older names', () => {
    const rows = parseProavisRows(loadFixture('proavis-2021-07-10'));
    expect(rows.map((r) => r.name)).toEqual([
      'HTG',
      'TSH',
      'FT4',
      'Ab-anti Perossidasi (Ab-TPO)',
      'Ab-anti recettore del TSH',
      'Ab-anti Tireoglobulina (Ab-HTG)',
    ]);
  });
});

describe('PROAVIS adapter: a reference line continuing below the row', () => {
  const word = (text: string, x: number, y: number, w: number, confidence = 0.99): TextItem => ({
    text,
    x,
    y,
    w,
    h: 10,
    confidence,
  });
  // The row has no reference and no unit: the reference line below, read badly, is attached to
  // it, and lies right of everything else on the row.
  const pt: PositionedText = {
    source: 'ocr',
    pages: [
      {
        width: 600,
        height: 400,
        items: [
          word('Valori di riferimento', 300, 100, 120),
          word('U.M.', 450, 100, 30),
          word('Metodica', 520, 100, 50),
          word('Glicemia', 10, 130, 80),
          word('87', 200, 130, 20),
          word('70 - 110', 330, 142, 60, 0.3),
        ],
      },
    ],
  };

  it('grows the row box to hold the attached line, so its confidence counts', () => {
    const [glucose] = parseProavisRows(pt);
    expect(glucose).toMatchObject({ name: 'Glicemia', ref: '70 - 110' });
    expect(glucose!.bbox).toEqual({ x: 10, y: 120, w: 380, h: 22 });
    expect(rowOcrConfidence(glucose!.bbox, pt.pages[0])).toBe(0.3);
  });
});
