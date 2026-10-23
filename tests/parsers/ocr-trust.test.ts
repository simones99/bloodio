import { describe, expect, it } from 'vitest';
import { ocrHash } from '../../scripts/ocr-assets.mjs';
import { PREPROCESS_PARAMS, PREPROCESS_STEPS } from '../../src/ingest/preprocess';
import { READING_SETTINGS, readingFingerprint } from '../../src/ocr/reading-fingerprint';
import {
  buildDraftReport,
  buildDraftRow,
  needsReview,
  OCR_MAX_CONFIDENCE,
  REVIEW_THRESHOLD,
} from '../../src/parsers/draft';
import {
  isTrustCurrent,
  OCR_TRUST,
  overlappingRows,
  passesTrust,
  trustableApartFromOcr,
  type OcrTrust,
} from '../../src/parsers/ocr-trust';
import { isAligned } from '../../src/parsers/layout';
import { parseProavisRows } from '../../src/parsers/proavis';
import { parseAstRows } from '../../src/parsers/ast';
import { FIXTURE_NAMES, loadFixture, loadOcrFixture } from '../fixtures/load';
import type {
  BBox,
  PositionedPage,
  PositionedText,
  RawRow,
  TextItem,
} from '../../src/parsers/types';

const TRUST: OcrTrust = {
  threshold: 0.9,
  measuredWith: { ocrHash: 'test', preprocess: '', reading: '' },
};
const BOX = { x: 0, y: 0, w: 100, h: 20 };

const raw = (overrides: Partial<RawRow> = {}): RawRow => ({
  name: 'TSH',
  value: '5,07',
  unit: 'µUI/mL',
  ref: 'da 0,27 a 4,20',
  section: 'MONITORAGGIO TIROIDE',
  page: 0,
  bbox: BOX,
  aligned: true,
  ...overrides,
});

/** One page with one run whose centre (50, 10) is in BOX, read with this confidence. */
const page = (confidence: number | undefined, x = 10): PositionedPage => ({
  width: 400,
  height: 100,
  items: [{ text: 'TSH 5,07', x, y: 15, w: 80, h: 10, confidence }],
});

function read(
  rawRow: RawRow,
  options: {
    confidence?: number;
    pages?: PositionedPage[];
    trust?: OcrTrust | null;
    maxConfidence?: number;
  } = {},
) {
  return buildDraftReport({
    adapterId: 'proavis',
    lab: 'PROAVIS',
    sampleDate: '2021-07-10',
    source: 'ocr',
    rawRows: [rawRow],
    pages: options.pages ?? [page(options.confidence ?? 0.97)],
    trust: options.trust === undefined ? TRUST : options.trust,
    options:
      options.maxConfidence === undefined ? undefined : { maxConfidence: options.maxConfidence },
  }).rows[0]!;
}

describe('the OCR trust rule (spec 2026-10-16 §6.2)', () => {
  it('lets a clean, confident row skip review when it is on', () => {
    const row = read(raw());
    expect(row.flags).toEqual([]);
    expect(row.confidence).toBe(1);
    expect(needsReview(row)).toBe(false);
    expect(row.ocr).toEqual({ confidence: 0.97, trustable: true });
  });

  it('keeps every row in review when it is off, trust: null not replaced by OCR_TRUST', () => {
    const row = read(raw(), { trust: null });
    expect(row.flags).toEqual(['low-ocr']);
    expect(row.confidence).toBe(OCR_MAX_CONFIDENCE);
    expect(needsReview(row)).toBe(true);
    expect(row.ocr).toEqual({ confidence: 0.97, trustable: true });
  });

  it('is off in the app: a row without a rule of its own uses OCR_TRUST', () => {
    const row = buildDraftReport({
      adapterId: 'proavis',
      lab: 'PROAVIS',
      sampleDate: '2021-07-10',
      source: 'ocr',
      rawRows: [raw()],
      pages: [page(1)],
    }).rows[0]!;
    expect(OCR_TRUST).toBeNull();
    expect(row.flags).toEqual(['low-ocr']);
    expect(row.confidence).toBe(OCR_MAX_CONFIDENCE);
  });

  it.each([
    ['1. a word below the threshold', () => read(raw(), { confidence: 0.85 })],
    ['1. a word without a confidence', () => read(raw(), { pages: [page(undefined)] })],
    ['2. another flag', () => read(raw({ unit: 'mg/dL' }))],
    ['2. a repaired unit', () => read(raw({ unit: 'pUlml' }))],
    ['3. an unsure row apart from OCR', () => read(raw(), { maxConfidence: 0.5 })],
    ['3 and 4. a value with a trailing mark', () => read(raw({ value: '5,07 H' }))],
    ['5. a value outside the reportable range', () => read(raw({ value: '1500' }))],
    [
      '5. an entry without a reportable range',
      () => read(raw({ name: 'MCH', value: '30', unit: 'pg', ref: '27 - 33', section: null })),
    ],
    ['5. a value without its unit', () => read(raw({ unit: '' }))],
    ['6. no reference range', () => read(raw({ ref: '' }))],
    ['a row not known to be aligned', () => read(raw({ aligned: undefined }))],
    ['a row off its line', () => read(raw({ aligned: false }))],
    ['no word in the box', () => read(raw(), { pages: [page(0.97, 300)] })],
    ['no page', () => read(raw(), { pages: [] })],
    ['a row on a page that was not passed', () => read(raw({ page: 1 }))],
  ])('keeps the row in review for %s', (_, row) => {
    expect(row().flags).toContain('low-ocr');
    expect(row().confidence).toBeLessThanOrEqual(OCR_MAX_CONFIDENCE);
    expect(needsReview(row())).toBe(true);
  });

  it('wants a clean value and an ordered range (conditions 4 and 6)', () => {
    const row = buildDraftRow(raw());
    expect(trustableApartFromOcr(row, REVIEW_THRESHOLD)).toBe(true);
    expect(trustableApartFromOcr({ ...row, rawValue: '5,07 H' }, REVIEW_THRESHOLD)).toBe(false);
    expect(trustableApartFromOcr({ ...row, rawValue: '5,6,4' }, REVIEW_THRESHOLD)).toBe(false);
    expect(trustableApartFromOcr({ ...row, rawValue: '< 0,005' }, REVIEW_THRESHOLD)).toBe(true);
    expect(
      trustableApartFromOcr(
        { ...row, parsed: { ...row.parsed, refMin: 4.2, refMax: 0.27 } },
        REVIEW_THRESHOLD,
      ),
    ).toBe(false);
    expect(
      trustableApartFromOcr(
        { ...row, parsed: { ...row.parsed, refMin: 4.2, refMax: 4.2 } },
        REVIEW_THRESHOLD,
      ),
    ).toBe(false);
    expect(
      trustableApartFromOcr({ ...row, parsed: { ...row.parsed, refMin: null } }, REVIEW_THRESHOLD),
    ).toBe(true);
  });

  it('fails closed on numbers that are not numbers', () => {
    const row = buildDraftRow(raw());
    const withParsed = (parsed: Partial<typeof row.parsed>) => ({
      ...row,
      parsed: { ...row.parsed, ...parsed },
    });
    expect(trustableApartFromOcr(withParsed({ value: NaN }), REVIEW_THRESHOLD)).toBe(false);
    expect(trustableApartFromOcr(withParsed({ value: Infinity }), REVIEW_THRESHOLD)).toBe(false);
    expect(trustableApartFromOcr(withParsed({ refMin: NaN }), REVIEW_THRESHOLD)).toBe(false);
    expect(trustableApartFromOcr(withParsed({ refMin: null, refMax: NaN }), REVIEW_THRESHOLD)).toBe(
      false,
    );
    expect(trustableApartFromOcr({ ...row, confidence: NaN }, REVIEW_THRESHOLD)).toBe(false);
    expect(read(raw(), { trust: { ...TRUST, threshold: NaN } }).flags).toContain('low-ocr');
    expect(read(raw(), { confidence: NaN }).flags).toContain('low-ocr');
  });

  it('reads the confidence on the page of the row', () => {
    const pages = [page(0.2), page(0.97)];
    expect(read(raw({ page: 1 }), { pages }).ocr?.confidence).toBe(0.97);
    expect(read(raw({ page: 1 }), { pages }).flags).toEqual([]);
    expect(read(raw({ page: 0 }), { pages }).ocr?.confidence).toBe(0.2);
    expect(read(raw({ page: 0 }), { pages }).flags).toContain('low-ocr');
  });

  it('never trusts a value with a dot (beyond spec §6.2): thousands or decimals is a guess', () => {
    const ferritin = read(
      raw({ name: 'Ferritina', value: '1.500', unit: 'ng/mL', ref: '30 - 400.000', section: null }),
    );
    expect(ferritin.ocr?.trustable).toBe(false);
    expect(ferritin.flags).toContain('low-ocr');
    const platelets = read(
      raw({
        name: 'Piastrine',
        value: '250.000',
        unit: '/µL',
        ref: '150.000 - 450.000',
        section: null,
      }),
    );
    expect(platelets.ocr?.trustable).toBe(false);
    expect(platelets.flags).toContain('low-ocr');
    const tsh = read(raw({ value: '5,07' }));
    expect(tsh.ocr?.trustable).toBe(true);
    expect(tsh.flags).toEqual([]);
  });

  it('accepts a value on the edge of the reportable range', () => {
    expect(read(raw({ value: '1000' })).flags).toEqual([]);
    expect(read(raw({ value: '1001' })).flags).toContain('low-ocr');
  });

  it('accepts a word exactly at the threshold', () => {
    expect(read(raw(), { confidence: 0.9 }).flags).toEqual([]);
    expect(read(raw(), { confidence: 0.89 }).flags).toContain('low-ocr');
  });

  it('leaves rows from a PDF text layer without OCR data', () => {
    const row = buildDraftReport({
      adapterId: 'proavis',
      lab: 'PROAVIS',
      sampleDate: '2021-07-10',
      source: 'pdf-text',
      rawRows: [raw()],
      trust: TRUST,
    }).rows[0]!;
    expect(row.ocr).toBeUndefined();
    expect(row.flags).toEqual([]);
  });
});

describe('rows whose boxes overlap (beyond spec 2026-10-16 §6.2)', () => {
  const at = (bbox: BBox, page = 0) => ({ page, bbox });

  it('finds boxes sharing an area on the same page', () => {
    expect(
      overlappingRows([
        at({ x: 0, y: 0, w: 100, h: 20 }),
        at({ x: 50, y: 19, w: 100, h: 20 }),
        at({ x: 0, y: 100, w: 100, h: 20 }),
      ]),
    ).toEqual([true, true, false]);
  });

  it('lets boxes that only touch, or lie on different pages, be', () => {
    expect(
      overlappingRows([at({ x: 0, y: 0, w: 100, h: 20 }), at({ x: 0, y: 20, w: 100, h: 20 })]),
    ).toEqual([false, false]);
    expect(
      overlappingRows([at({ x: 0, y: 0, w: 100, h: 20 }), at({ x: 100, y: 0, w: 100, h: 20 })]),
    ).toEqual([false, false]);
    expect(
      overlappingRows([at({ x: 0, y: 0, w: 100, h: 20 }), at({ x: 0, y: 0, w: 100, h: 20 }, 1)]),
    ).toEqual([false, false]);
  });

  it('counts a box it cannot check as overlapping', () => {
    const fine = at({ x: 0, y: 100, w: 100, h: 20 });
    expect(overlappingRows([at({ x: 0, y: 0, w: 0, h: 20 })])).toEqual([true]);
    expect(overlappingRows([at({ x: 0, y: 0, w: 100, h: -1 })])).toEqual([true]);
    expect(overlappingRows([at({ x: NaN, y: 0, w: 100, h: 20 }), fine])).toEqual([true, true]);
    expect(overlappingRows([at({ x: 0, y: 0, w: Infinity, h: 20 })])).toEqual([true]);
  });

  it('keeps both rows in review when one took the value of the row above', () => {
    const word = (text: string, x: number, y: number, w: number): TextItem => ({
      text,
      x,
      y,
      w,
      h: 10,
      confidence: 0.99,
    });
    // The value of "Colesterolo totale" was not read: the row picks up Glicemia's line above.
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
            word('70 - 110', 330, 130, 60),
            word('mg/dL', 450, 130, 40),
            word('Colesterolo totale', 10, 138, 120),
          ],
        },
      ],
    };
    const rows = buildDraftReport({
      adapterId: 'proavis',
      lab: 'PROAVIS',
      sampleDate: null,
      source: 'ocr',
      rawRows: parseProavisRows(pt),
      pages: pt.pages,
      trust: TRUST,
    }).rows;
    expect(rows.map((row) => [row.rawName, row.rawValue])).toEqual([
      ['Glicemia', '87'],
      ['Colesterolo totale', '87'],
    ]);
    for (const row of rows) {
      expect(row.ocr).toEqual({ confidence: 0.99, trustable: false });
      expect(row.flags).toContain('low-ocr');
    }
  });

  it('trusts neither of two otherwise clean rows that overlap', () => {
    const rows = buildDraftReport({
      adapterId: 'proavis',
      lab: 'PROAVIS',
      sampleDate: null,
      source: 'ocr',
      rawRows: [raw(), raw({ bbox: { ...BOX, y: 10 } })],
      pages: [page(0.97)],
      trust: TRUST,
    }).rows;
    expect(rows.map((row) => row.ocr?.trustable)).toEqual([false, false]);
    expect(rows.every((row) => row.flags.includes('low-ocr'))).toBe(true);
  });
});

describe('rows read off their line (beyond spec 2026-10-16 §6.2)', () => {
  const word = (text: string, x: number, y: number, w: number): TextItem => ({
    text,
    x,
    y,
    w,
    h: 10,
    confidence: 0.99,
  });
  const header = [
    word('Valori di riferimento', 300, 100, 120),
    word('U.M.', 450, 100, 30),
    word('Metodica', 520, 100, 50),
  ];
  const trusted = (items: TextItem[]) => {
    const pt: PositionedText = { source: 'ocr', pages: [{ width: 600, height: 400, items }] };
    return buildDraftReport({
      adapterId: 'proavis',
      lab: 'PROAVIS',
      sampleDate: null,
      source: 'ocr',
      rawRows: parseProavisRows(pt),
      pages: pt.pages,
      trust: TRUST,
    }).rows.map((row) => [row.rawName, row.rawValue, !row.flags.includes('low-ocr')]);
  };

  it('finds every row of the fixtures on its line, from the text layer and from OCR', () => {
    // Each fixture is read by its own lab's adapter; the other one finds no rows in it.
    const parse = (pt: PositionedText) => [...parseAstRows(pt), ...parseProavisRows(pt)];
    const rows = [
      ...FIXTURE_NAMES.flatMap((name) => parse(loadFixture(name))),
      ...parse(loadOcrFixture('proavis-2021-07-10')),
    ];
    expect(rows).toHaveLength(88);
    expect(rows.filter((row) => row.aligned !== true)).toEqual([]);
  });

  it('trusts a clean row on its line', () => {
    const glucose = [
      word('Glicemia', 10, 130, 80),
      word('87', 200, 130, 20),
      word('70 - 110', 330, 130, 60),
      word('mg/dL', 450, 130, 40),
    ];
    expect(trusted([...header, ...glucose])).toEqual([['Glicemia', '87', true]]);
  });

  it('trusts no row when a tilt moved every value one line down', () => {
    const shifted = [
      word('Glicemia', 10, 130, 80),
      word('87', 200, 140, 20),
      word('70 - 110', 330, 140, 60),
      word('mg/dL', 450, 140, 40),
      word('Colesterolo totale', 10, 145, 120),
      word('210', 200, 155, 20),
      word('< 200', 330, 155, 60),
      word('mg/dL', 450, 155, 40),
      word('Trigliceridi', 10, 160, 80),
      word('95', 200, 170, 20),
      word('< 150', 330, 170, 60),
      word('mg/dL', 450, 170, 40),
      word('Azotemia', 10, 175, 80),
    ];
    expect(trusted([...header, ...shifted])).toEqual([
      ['Colesterolo totale', '87', false],
      ['Trigliceridi', '210', false],
      ['Azotemia', '95', false],
    ]);
  });

  it('wants the value within 0.35 lines of the name and the unit within 0.8', () => {
    const name = word('Glicemia', 10, 130, 80);
    const at = (text: string, y: number) => word(text, 200, y, 20);
    expect(isAligned(name, [at('87', 133.5)], [at('mg/dL', 122)], [at('70', 122)])).toBe(true);
    expect(isAligned(name, [at('87', 126)], [], [])).toBe(false);
    expect(isAligned(name, [at('87', 130)], [at('mg/dL', 121)], [])).toBe(false);
    expect(isAligned(name, [at('87', 130)], [at('mg/dL', 139)], [])).toBe(false);
    expect(isAligned(name, [at('87', 130)], [], [at('70 - 110', 121)])).toBe(false);
    expect(isAligned(name, [], [at('mg/dL', 130)], [])).toBe(false);
    expect(isAligned({ ...name, h: 0 }, [at('87', 130)], [], [])).toBe(false);
    expect(isAligned(name, [at('87', NaN)], [], [])).toBe(false);
  });

  it('does not trust a row whose reference sits more than 0.8 lines off', () => {
    const glucose = [
      word('Glicemia', 10, 130, 80),
      word('87', 200, 130, 20),
      word('70 - 110', 330, 121.8, 60),
      word('mg/dL', 450, 130, 40),
    ];
    const pt: PositionedText = {
      source: 'ocr',
      pages: [{ width: 600, height: 400, items: [...header, ...glucose] }],
    };
    expect(parseProavisRows(pt)).toMatchObject([{ ref: '70 - 110', aligned: false }]);
    expect(trusted([...header, ...glucose])).toEqual([['Glicemia', '87', false]]);
  });

  it('does not trust a row whose unit sits more than 0.8 lines off', () => {
    const glucose = [
      word('Glicemia', 10, 130, 80),
      word('87', 200, 130, 20),
      word('70 - 110', 330, 130, 60),
      word('mg/dL', 450, 121.8, 40),
    ];
    const pt: PositionedText = {
      source: 'ocr',
      pages: [{ width: 600, height: 400, items: [...header, ...glucose] }],
    };
    expect(parseProavisRows(pt)).toMatchObject([{ unit: 'mg/dL', aligned: false }]);
    expect(trusted([...header, ...glucose])).toEqual([['Glicemia', '87', false]]);
  });
});

describe('OCR_TRUST (spec 2026-10-16 §6.4)', () => {
  it('was measured with the models, the pre-processing and the reading settings of today', () => {
    expect(
      isTrustCurrent(OCR_TRUST, {
        ocrHash: ocrHash(),
        preprocess: PREPROCESS_STEPS.join('+'),
        reading: readingFingerprint(),
      }),
    ).toBe(true);
  });

  it('goes stale when the models, the pre-processing or the reading settings change', () => {
    const current = { ocrHash: 'abcd1234', preprocess: 'light', reading: readingFingerprint() };
    const measuredWith = (changes: Partial<OcrTrust['measuredWith']>): OcrTrust => ({
      threshold: 0.9,
      measuredWith: { ...current, ...changes },
    });
    expect(isTrustCurrent(null, current)).toBe(true);
    expect(isTrustCurrent(measuredWith({}), current)).toBe(true);
    expect(isTrustCurrent(measuredWith({ ocrHash: 'ffff0000' }), current)).toBe(false);
    expect(isTrustCurrent(measuredWith({ preprocess: '' }), current)).toBe(false);
    expect(isTrustCurrent(measuredWith({ reading: '' }), current)).toBe(false);
  });

  it('has a reading fingerprint that follows every setting', () => {
    const today = readingFingerprint();
    expect(readingFingerprint()).toBe(today);
    const changed = [
      { ...READING_SETTINGS, languages: 'eng' },
      { ...READING_SETTINGS, engineMode: 3 },
      { ...READING_SETTINGS, maxSide: 4000 },
      { ...READING_SETTINGS, pdfScale: 2 },
      { ...READING_SETTINGS, wordGapRatio: 0.7 },
      ...Object.keys(PREPROCESS_PARAMS).map((key) => ({
        ...READING_SETTINGS,
        preprocess: { ...PREPROCESS_PARAMS, [key]: -1 },
      })),
    ];
    for (const settings of changed) expect(readingFingerprint(settings)).not.toBe(today);
    expect(Object.keys(READING_SETTINGS)).toHaveLength(6);
  });
});

describe('passesTrust', () => {
  it('needs a trustable row with a measured confidence at or above the threshold', () => {
    expect(passesTrust({ confidence: 0.9, trustable: true }, 0.9)).toBe(true);
    expect(passesTrust({ confidence: 0.95, trustable: true }, 0.9)).toBe(true);
    expect(passesTrust({ confidence: 0.89, trustable: true }, 0.9)).toBe(false);
    expect(passesTrust({ confidence: 0.99, trustable: false }, 0.9)).toBe(false);
  });

  it('fails closed on missing, null or NaN data', () => {
    expect(passesTrust(undefined, 0.9)).toBe(false);
    expect(passesTrust({ confidence: null, trustable: true }, 0.9)).toBe(false);
    expect(passesTrust({ confidence: Number.NaN, trustable: true }, 0.9)).toBe(false);
    expect(passesTrust({ confidence: 0.99, trustable: true }, Number.NaN)).toBe(false);
  });
});
