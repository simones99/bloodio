import { PDFDocument, StandardFonts } from 'pdf-lib';
import { loadFixture, type FixtureName } from './load';

/**
 * Rebuilds a PDF from an anonymized fixture, drawing every text item at its recorded position.
 * Used wherever a test needs a real file: no real report ever enters the repository.
 */
export async function buildPdfFromFixture(name: FixtureName): Promise<Uint8Array> {
  const fixture = loadFixture(name);
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  for (const source of fixture.pages) {
    const page = pdf.addPage([source.width, source.height]);
    for (const item of source.items) {
      // Helvetica (WinAnsi) has the micro sign but not the Greek mu the lab prints.
      const text = item.text.replace(/μ/g, 'µ');
      page.drawText(text, { x: item.x, y: source.height - item.y, size: item.h, font });
    }
  }
  return pdf.save();
}

/** A PDF with pages but no text, like a scanned report. */
export async function buildEmptyPdf(): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.addPage([595, 842]);
  return pdf.save();
}
