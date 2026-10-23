import type { OcrEngine, OcrProgress } from '../ocr/types';
import { OcrUnavailableError } from '../ocr/types';
import type { PositionedText } from '../parsers/types';
import { sha256Hex } from './hash';
import type { PageRenderer, RenderedPage } from './image-pages';
import { identityGeometry, type PageGeometry } from './page-geometry';
import { hasTextLayer, pdfToPositionedText, type PdfDocumentLike } from './pdf-text';

export type IngestErrorCode =
  /** Not a PDF or an image we know. */
  | 'unsupported-type'
  /** A PDF together with images, or more than one PDF. */
  | 'mixed-selection'
  | 'password'
  | 'unreadable'
  /** A HEIC/HEIF photo this browser cannot decode. */
  | 'heic-unsupported'
  /** The OCR engine or its models could not be loaded. */
  | 'ocr-unavailable';

export class IngestError extends Error {
  constructor(readonly code: IngestErrorCode) {
    super(`Cannot read the file: ${code}`);
    this.name = 'IngestError';
  }
}

/** One chosen file, kept only if the user enabled "conserva file originale". */
export interface SourceFile {
  data: ArrayBuffer;
  mimeType: string;
  fileName: string;
}

export interface IngestedFile {
  text: PositionedText;
  fileHash: string | null;
  /** The chosen files in page order. */
  files: SourceFile[];
  /**
   * How each page of `text` was read from its original, aligned with `text.pages`. Lives only in
   * the verify session, for "Vedi originale": it is never saved.
   */
  geometry: PageGeometry[];
}

export type OpenPdf = (data: ArrayBuffer) => Promise<PdfDocumentLike>;

export interface IngestDeps {
  openPdf: OpenPdf;
  /** Loads the OCR engine: called only for scans and photos. */
  ocr: () => Promise<OcrEngine>;
  /** Ingest only reads pages: drawing the original is for "Vedi originale". */
  pages: Omit<PageRenderer, 'original'>;
  onProgress?: (progress: OcrProgress) => void;
  signal?: AbortSignal;
}

/** A cancellation from an AbortSignal, whatever realm its DOMException comes from. */
export function isAbortError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { name?: unknown }).name === 'AbortError'
  );
}

const IMAGE_TYPES: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  heic: 'image/heic',
  heif: 'image/heif',
};

const extension = (name: string) => /\.([a-z0-9]+)$/i.exec(name)?.[1]?.toLowerCase() ?? '';

const isPdf = (file: File) => file.type === 'application/pdf' || extension(file.name) === 'pdf';

/** The image type of a file, from the browser or else from its extension; null if not an image. */
function imageType(file: File): string | null {
  if (Object.values(IMAGE_TYPES).includes(file.type)) return file.type;
  return IMAGE_TYPES[extension(file.name)] ?? null;
}

/** Cameras and scanners number their files in sequence; the order of a FileList is not reliable. */
export function pageOrder(a: File, b: File): number {
  return (
    a.name.localeCompare(b.name, undefined, { numeric: true }) || a.lastModified - b.lastModified
  );
}

/** One file: the hash of its bytes, as for a PDF. Several: the hash of their hashes in page order. */
async function hashOf(files: SourceFile[]): Promise<string | null> {
  const hashes = await Promise.all(files.map((file) => sha256Hex(file.data)));
  if (hashes.some((hash) => hash === null)) return null;
  if (hashes.length === 1) return hashes[0]!;
  return sha256Hex(new TextEncoder().encode(hashes.join('')).buffer as ArrayBuffer);
}

async function recognize(pages: RenderedPage[], deps: IngestDeps): Promise<PositionedText> {
  let engine: OcrEngine;
  try {
    engine = await deps.ocr();
  } catch {
    // The engine's chunk did not load: a stale tab after a deploy, or no service worker yet.
    throw new IngestError('ocr-unavailable');
  }
  try {
    const canvases = pages.map((page) => page.canvas);
    return await engine.recognize(canvases, { onProgress: deps.onProgress, signal: deps.signal });
  } catch (error) {
    if (deps.signal?.aborted || isAbortError(error)) throw error;
    throw new IngestError(error instanceof OcrUnavailableError ? 'ocr-unavailable' : 'unreadable');
  }
}

async function ingestPdf(file: File, deps: IngestDeps): Promise<IngestedFile> {
  const source: SourceFile = {
    data: await file.arrayBuffer(),
    mimeType: 'application/pdf',
    fileName: file.name,
  };
  let doc: PdfDocumentLike | undefined;
  let text: PositionedText;
  let pages: RenderedPage[] | null = null;
  try {
    // pdf.js takes ownership of the buffer it is given, so it gets a copy.
    doc = await deps.openPdf(source.data.slice(0));
    text = await pdfToPositionedText(doc);
    if (!hasTextLayer(text)) {
      deps.signal?.throwIfAborted();
      pages = await deps.pages.fromPdf(doc);
    }
  } catch (error) {
    if (isAbortError(error) || deps.signal?.aborted) throw error;
    const name = error instanceof Error ? error.name : '';
    throw new IngestError(name === 'PasswordException' ? 'password' : 'unreadable');
  } finally {
    // The canvases do not depend on the document: free pdf.js before the slow OCR starts.
    void doc?.destroy?.()?.catch(() => {});
  }
  if (pages) text = await recognize(pages, deps);
  // A text layer is in PDF points at scale 1: the original's own units.
  const geometry = pages ? pages.map((page) => page.geometry) : text.pages.map(identityGeometry);
  return { text, fileHash: await hashOf([source]), files: [source], geometry };
}

async function ingestImages(images: File[], deps: IngestDeps): Promise<IngestedFile> {
  const ordered = [...images].sort(pageOrder);
  const files = await Promise.all(
    ordered.map(async (file) => ({
      data: await file.arrayBuffer(),
      mimeType: imageType(file)!,
      fileName: file.name,
    })),
  );
  deps.signal?.throwIfAborted();
  const pages = await deps.pages.fromImages(ordered);
  const text = await recognize(pages, deps);
  const geometry = pages.map((page) => page.geometry);
  return { text, fileHash: await hashOf(files), files, geometry };
}

/**
 * Reads the files chosen by the user: one PDF, or one or more images that are the pages of one
 * report. Everything happens on the device. A cancellation rejects with the signal's AbortError.
 */
export async function ingestFile(chosen: File[], deps: IngestDeps): Promise<IngestedFile> {
  deps.signal?.throwIfAborted();
  const pdfs = chosen.filter(isPdf);
  const images = chosen.filter((file) => !isPdf(file) && imageType(file) !== null);
  if (chosen.length === 0 || pdfs.length + images.length < chosen.length) {
    throw new IngestError('unsupported-type');
  }
  if (pdfs.length > 1 || (pdfs.length === 1 && images.length > 0)) {
    throw new IngestError('mixed-selection');
  }
  return pdfs[0] ? ingestPdf(pdfs[0], deps) : ingestImages(images, deps);
}
