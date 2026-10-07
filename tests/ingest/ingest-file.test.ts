import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { describe, expect, it } from 'vitest';
import { IngestError, ingestFile, type OpenPdf } from '../../src/ingest/ingest-file';
import { buildEmptyPdf, buildPdfFromFixture } from '../fixtures/build-pdf';

const openPdf: OpenPdf = (data) =>
  getDocument({ data: new Uint8Array(data), useSystemFonts: true, verbosity: 0 }).promise;

const pdfFile = (bytes: Uint8Array, name = 'referto.pdf', type = 'application/pdf') =>
  new File([bytes as BlobPart], name, { type });

const codeOf = async (promise: Promise<unknown>) => {
  const error = await promise.catch((e: unknown) => e);
  expect(error).toBeInstanceOf(IngestError);
  return (error as IngestError).code;
};

describe('ingestFile', () => {
  it('returns positioned text, the file hash and the untouched bytes', async () => {
    const bytes = await buildPdfFromFixture('proavis-2021-07-10');
    const result = await ingestFile(pdfFile(bytes), openPdf);
    expect(result.text.pages).toHaveLength(1);
    expect(result.fileHash).toMatch(/^[0-9a-f]{64}$/);
    expect(result).toMatchObject({ mimeType: 'application/pdf', fileName: 'referto.pdf' });
    expect(new Uint8Array(result.data)).toEqual(bytes);
  });

  it('accepts a PDF that the browser gave no MIME type', async () => {
    const bytes = await buildPdfFromFixture('proavis-2021-07-10');
    expect((await ingestFile(pdfFile(bytes, 'Referto.PDF', ''), openPdf)).text.pages).toHaveLength(
      1,
    );
  });

  it('asks for OCR for scans and photos', async () => {
    expect(await codeOf(ingestFile(pdfFile(await buildEmptyPdf()), openPdf))).toBe('needs-ocr');
    const photo = new File([new Uint8Array([1])], 'foto.jpg', { type: 'image/jpeg' });
    expect(await codeOf(ingestFile(photo, openPdf))).toBe('needs-ocr');
  });

  it('refuses other files and broken PDFs', async () => {
    const doc = new File(['x'], 'referto.docx', { type: 'application/msword' });
    expect(await codeOf(ingestFile(doc, openPdf))).toBe('unsupported-type');
    expect(await codeOf(ingestFile(pdfFile(new Uint8Array([1, 2, 3])), openPdf))).toBe(
      'unreadable',
    );
  });

  it('reports a password-protected PDF', async () => {
    const locked: OpenPdf = () =>
      Promise.reject(Object.assign(new Error('x'), { name: 'PasswordException' }));
    expect(await codeOf(ingestFile(pdfFile(await buildEmptyPdf()), locked))).toBe('password');
  });
});
