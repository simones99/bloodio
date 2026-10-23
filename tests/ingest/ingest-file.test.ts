import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { describe, expect, it, vi } from 'vitest';
import { sha256Hex } from '../../src/ingest/hash';
import {
  IngestError,
  ingestFile,
  isAbortError,
  pageOrder,
  type IngestDeps,
  type OpenPdf,
} from '../../src/ingest/ingest-file';
import type { RenderedPage } from '../../src/ingest/image-pages';
import type { PageGeometry } from '../../src/ingest/page-geometry';
import { OcrUnavailableError, type OcrEngine } from '../../src/ocr/types';
import type { PositionedText } from '../../src/parsers/types';
import { buildEmptyPdf, buildPdfFromFixture } from '../fixtures/build-pdf';

const openPdf: OpenPdf = (data) =>
  getDocument({ data: new Uint8Array(data), useSystemFonts: true, verbosity: 0 }).promise;

const OCR_TEXT: PositionedText = {
  source: 'ocr',
  pages: [{ width: 100, height: 100, items: [{ text: 'TSH', x: 1, y: 10, w: 20, h: 8 }] }],
};

/** Stands in for a canvas: the fake renderer labels each one with its file name. */
const canvas = (label: string) => ({ label }) as unknown as HTMLCanvasElement;

/** A 300 DPI A4 scan, slightly turned by the deskew. */
const SCAN: PageGeometry = {
  width: 612,
  height: 792,
  scale: 300 / 72,
  quarterTurns: 0,
  skewDegrees: 0.8,
};

/** A drawn page as the fake renderer returns it: a labelled canvas and how it was made. */
const rendered = (label: string, geometry: PageGeometry = SCAN): RenderedPage => ({
  canvas: canvas(label),
  geometry,
});

/** A recognize mock typed like the real one, so its calls can be read back. */
const recognizeMock = () => vi.fn<OcrEngine['recognize']>(() => Promise.resolve(OCR_TEXT));

/** Opens PDFs like the real one, but counts how often the document is released. */
function trackedOpen() {
  const destroy = vi.fn(() => Promise.resolve());
  const open: OpenPdf = async (data) => Object.assign(await openPdf(data), { destroy });
  return { open, destroy };
}

function deps(overrides: Partial<IngestDeps> = {}): IngestDeps {
  const engine: OcrEngine = { recognize: recognizeMock() };
  return {
    openPdf,
    ocr: () => Promise.resolve(engine),
    pages: {
      fromImages: vi.fn((files: File[]) => Promise.resolve(files.map((f) => rendered(f.name)))),
      fromPdf: vi.fn(() => Promise.resolve([rendered('pdf page')])),
    },
    ...overrides,
  };
}

const pdfFile = (bytes: Uint8Array, name = 'referto.pdf', type = 'application/pdf') =>
  new File([bytes as BlobPart], name, { type });

const image = (name: string, bytes: number[] = [1], type = 'image/jpeg', lastModified = 0) =>
  new File([new Uint8Array(bytes)], name, { type, lastModified });

const hashOf = async (bytes: number[]) => (await sha256Hex(new Uint8Array(bytes).buffer))!;

const codeOf = async (promise: Promise<unknown>) => {
  const error = await promise.catch((e: unknown) => e);
  expect(error).toBeInstanceOf(IngestError);
  return (error as IngestError).code;
};

describe('ingestFile — a PDF with text', () => {
  it('returns positioned text, the file hash and the untouched bytes', async () => {
    const bytes = await buildPdfFromFixture('proavis-2021-07-10');
    const result = await ingestFile([pdfFile(bytes)], deps());
    expect(result.text.source).toBe('pdf-text');
    expect(result.text.pages).toHaveLength(1);
    expect(result.fileHash).toBe(await sha256Hex(bytes.slice().buffer));
    expect(result.files).toHaveLength(1);
    expect(result.files[0]).toMatchObject({ mimeType: 'application/pdf', fileName: 'referto.pdf' });
    expect(new Uint8Array(result.files[0]!.data)).toEqual(bytes);
  });

  it('gives each page the identity geometry, in PDF points at scale 1', async () => {
    const result = await ingestFile(
      [pdfFile(await buildPdfFromFixture('proavis-2021-07-10'))],
      deps(),
    );
    expect(result.geometry).toEqual([
      { width: 612, height: 792, scale: 1, quarterTurns: 0, skewDegrees: 0 },
    ]);
  });

  it('accepts a PDF that the browser gave no MIME type', async () => {
    const bytes = await buildPdfFromFixture('proavis-2021-07-10');
    const result = await ingestFile([pdfFile(bytes, 'Referto.PDF', '')], deps());
    expect(result.text.pages).toHaveLength(1);
  });

  it('refuses a broken PDF and reports a password-protected one', async () => {
    expect(await codeOf(ingestFile([pdfFile(new Uint8Array([1, 2, 3]))], deps()))).toBe(
      'unreadable',
    );
    const locked: OpenPdf = () =>
      Promise.reject(Object.assign(new Error('x'), { name: 'PasswordException' }));
    expect(
      await codeOf(ingestFile([pdfFile(await buildEmptyPdf())], deps({ openPdf: locked }))),
    ).toBe('password');
  });
});

describe('ingestFile — scans and photos', () => {
  it('never loads the OCR for a PDF with text, and releases the document', async () => {
    const ocr = vi.fn<IngestDeps['ocr']>();
    const { open, destroy } = trackedOpen();
    await ingestFile(
      [pdfFile(await buildPdfFromFixture('proavis-2021-07-10'))],
      deps({ ocr, openPdf: open }),
    );
    expect(ocr).not.toHaveBeenCalled();
    expect(destroy).toHaveBeenCalledOnce();
  });

  it('gives the engine the canvases of a scanned PDF and releases the document', async () => {
    const recognize = recognizeMock();
    const page = rendered('scan page');
    const { open, destroy } = trackedOpen();
    const d = deps({
      ocr: () => Promise.resolve({ recognize }),
      openPdf: open,
      pages: { fromImages: vi.fn(), fromPdf: vi.fn(() => Promise.resolve([page])) },
    });
    const result = await ingestFile([pdfFile(await buildEmptyPdf())], d);
    expect(recognize.mock.calls[0]?.[0]).toEqual([canvas('scan page')]);
    expect(result.geometry).toEqual([SCAN]);
    expect(destroy).toHaveBeenCalledOnce();
  });

  it('releases the document when the pages cannot be drawn', async () => {
    const { open, destroy } = trackedOpen();
    const d = deps({
      openPdf: open,
      pages: { fromImages: vi.fn(), fromPdf: () => Promise.reject(new Error('oom')) },
    });
    expect(await codeOf(ingestFile([pdfFile(await buildEmptyPdf())], d))).toBe('unreadable');
    expect(destroy).toHaveBeenCalledOnce();
  });

  it('reads a PDF without text with the OCR', async () => {
    const d = deps();
    const result = await ingestFile([pdfFile(await buildEmptyPdf(), 'scansione.pdf')], d);
    expect(d.pages.fromPdf).toHaveBeenCalledOnce();
    expect(result.text).toBe(OCR_TEXT);
    expect(result.files[0]).toMatchObject({
      mimeType: 'application/pdf',
      fileName: 'scansione.pdf',
    });
  });

  it('reads photos as the pages of one report, ordered by file name', async () => {
    const recognize = recognizeMock();
    // Each photo has its own size and tilt: the renderer labels them by file name.
    const photo = (name: string): PageGeometry => ({
      width: 3000 + Number(/\d+/.exec(name)![0]),
      height: 4000,
      scale: 0.875,
      quarterTurns: 0,
      skewDegrees: -1.2,
    });
    const d = deps({
      ocr: () => Promise.resolve({ recognize }),
      pages: {
        fromImages: (files) => Promise.resolve(files.map((f) => rendered(f.name, photo(f.name)))),
        fromPdf: vi.fn(),
      },
    });
    const result = await ingestFile(
      [image('IMG_10.jpg'), image('IMG_9.jpg'), image('IMG_11.jpg')],
      d,
    );
    expect(result.files.map((file) => file.fileName)).toEqual([
      'IMG_9.jpg',
      'IMG_10.jpg',
      'IMG_11.jpg',
    ]);
    expect(recognize.mock.calls[0]?.[0]).toEqual([
      canvas('IMG_9.jpg'),
      canvas('IMG_10.jpg'),
      canvas('IMG_11.jpg'),
    ]);
    expect(result.geometry.map((page) => page.width)).toEqual([3009, 3010, 3011]);
    expect(result.geometry[0]).toEqual(photo('IMG_9.jpg'));
  });

  it('breaks a tie in names with the modification date', () => {
    const later = image('foto.jpg', [1], 'image/jpeg', 20);
    const earlier = image('foto.jpg', [2], 'image/jpeg', 10);
    expect([later, earlier].sort(pageOrder)).toEqual([earlier, later]);
  });

  it('hashes one photo like a PDF, and several by their hashes in page order', async () => {
    const one = await ingestFile([image('a.jpg', [1, 2, 3])], deps());
    expect(one.fileHash).toBe(await hashOf([1, 2, 3]));

    const two = await ingestFile([image('b.jpg', [2]), image('a.jpg', [1])], deps());
    const joined = new TextEncoder().encode((await hashOf([1])) + (await hashOf([2])));
    expect(two.fileHash).toBe(await sha256Hex(joined.buffer as ArrayBuffer));

    const swapped = await ingestFile([image('a.jpg', [1]), image('b.jpg', [2])], deps());
    expect(swapped.fileHash).toBe(two.fileHash);
  });

  it('gives the engine the progress callback and the signal', async () => {
    const recognize = recognizeMock();
    const onProgress = vi.fn();
    const { signal } = new AbortController();
    await ingestFile(
      [image('a.jpg')],
      deps({ ocr: () => Promise.resolve({ recognize }), onProgress, signal }),
    );
    expect(recognize).toHaveBeenCalledWith([canvas('a.jpg')], { onProgress, signal });
  });

  it('keeps a type for a photo the browser left untyped', async () => {
    const result = await ingestFile([image('foto.JPG', [1], '')], deps());
    expect(result.files[0]?.mimeType).toBe('image/jpeg');
  });
});

describe('ingestFile — refusals and failures', () => {
  it('refuses files that are neither a PDF nor an image', async () => {
    const doc = new File(['x'], 'referto.docx', { type: 'application/msword' });
    expect(await codeOf(ingestFile([doc], deps()))).toBe('unsupported-type');
    const pdf = pdfFile(await buildEmptyPdf());
    expect(await codeOf(ingestFile([pdf, doc], deps()))).toBe('unsupported-type');
    expect(await codeOf(ingestFile([], deps()))).toBe('unsupported-type');
  });

  it('refuses a PDF together with images, or two PDFs', async () => {
    const pdf = pdfFile(await buildEmptyPdf());
    expect(await codeOf(ingestFile([pdf, image('a.jpg')], deps()))).toBe('mixed-selection');
    expect(await codeOf(ingestFile([pdf, pdfFile(await buildEmptyPdf(), 'b.pdf')], deps()))).toBe(
      'mixed-selection',
    );
  });

  it('says the OCR is unavailable when the engine or its models cannot load', async () => {
    const noChunk = deps({ ocr: () => Promise.reject(new Error('offline')) });
    expect(await codeOf(ingestFile([image('a.jpg')], noChunk))).toBe('ocr-unavailable');
    const noModels = deps({
      ocr: () =>
        Promise.resolve({ recognize: () => Promise.reject(new OcrUnavailableError('404')) }),
    });
    expect(await codeOf(ingestFile([image('a.jpg')], noModels))).toBe('ocr-unavailable');
  });

  it('reports a failed recognition as unreadable', async () => {
    const broken = deps({
      ocr: () => Promise.resolve({ recognize: () => Promise.reject(new Error('boom')) }),
    });
    expect(await codeOf(ingestFile([image('a.jpg')], broken))).toBe('unreadable');
  });

  it('passes on what the renderer says about an image it cannot open', async () => {
    const heic = deps({
      pages: {
        fromImages: () => Promise.reject(new IngestError('heic-unsupported')),
        fromPdf: () => Promise.resolve([]),
      },
    });
    expect(await codeOf(ingestFile([image('foto.heic', [1], 'image/heic')], heic))).toBe(
      'heic-unsupported',
    );
  });

  it('lets a cancellation through as it is', async () => {
    const controller = new AbortController();
    controller.abort();
    const before = await ingestFile([image('a.jpg')], deps({ signal: controller.signal })).catch(
      (e: unknown) => e,
    );
    expect(isAbortError(before)).toBe(true);
    const pdfBefore = await ingestFile(
      [pdfFile(await buildEmptyPdf())],
      deps({ signal: controller.signal }),
    ).catch((e: unknown) => e);
    expect(isAbortError(pdfBefore)).toBe(true);

    const during = deps({
      ocr: () =>
        Promise.resolve({
          recognize: () => Promise.reject(new DOMException('cancelled', 'AbortError')),
        }),
    });
    const error = await ingestFile([image('a.jpg')], during).catch((e: unknown) => e);
    expect(isAbortError(error)).toBe(true);
    expect(error).not.toBeInstanceOf(IngestError);
  });
});
