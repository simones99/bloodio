import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { describe, expect, it } from 'vitest';
import { hasTextLayer, pdfToPositionedText } from '../../src/ingest/pdf-text';
import { needsReview } from '../../src/parsers/draft';
import { parseReport } from '../../src/parsers/registry';
import { buildEmptyPdf, buildPdfFromFixture } from '../fixtures/build-pdf';

async function read(data: Uint8Array) {
  const doc = await getDocument({ data, useSystemFonts: true, verbosity: 0 }).promise;
  return pdfToPositionedText(doc);
}

describe('pdfToPositionedText', () => {
  it('reads a PROAVIS PDF into a report with every row recognised', async () => {
    const text = await read(await buildPdfFromFixture('proavis-2022-08-20'));
    expect(text.source).toBe('pdf-text');
    expect(text.pages).toHaveLength(1);
    expect(hasTextLayer(text)).toBe(true);

    const report = parseReport(text);
    expect(report).toMatchObject({
      adapterId: 'proavis',
      sampleDate: '2022-08-20',
      type: 'sangue',
    });
    expect(report.rows).toHaveLength(25);
    expect(report.rows.filter(needsReview)).toEqual([]);
    const tsh = report.rows.find((r) => r.rawName === 'TSH');
    expect(tsh?.parsed).toMatchObject({ value: 5.07, unit: 'µUI/mL', refMin: 0.27, refMax: 4.2 });
  });

  it('reads the two-page report and the AST layout', async () => {
    const mixed = parseReport(await read(await buildPdfFromFixture('proavis-2021-10-04')));
    expect(mixed.rows).toHaveLength(49);
    expect(mixed.type).toBe('misto');
    const ast = parseReport(await read(await buildPdfFromFixture('ast-2021-08-30')));
    expect(ast).toMatchObject({ adapterId: 'ast', sampleDate: '2021-08-30' });
    expect(ast.rows.map((r) => r.rawName)).toEqual(['TSH', 'FT4']);
  });

  it('recognises a scan by its missing text layer', async () => {
    expect(hasTextLayer(await read(await buildEmptyPdf()))).toBe(false);
  });
});
