import type { PositionedText } from '../parsers/types';
import { sha256Hex } from './hash';
import { hasTextLayer, pdfToPositionedText, type PdfDocumentLike } from './pdf-text';

export type IngestErrorCode =
  /** Not a PDF or an image we know. */
  | 'unsupported-type'
  /** A scan or a photo: needs OCR, which arrives in milestone 3. */
  | 'needs-ocr'
  | 'password'
  | 'unreadable';

export class IngestError extends Error {
  constructor(readonly code: IngestErrorCode) {
    super(`Cannot read the file: ${code}`);
    this.name = 'IngestError';
  }
}

export interface IngestedFile {
  text: PositionedText;
  fileHash: string | null;
  /** The original bytes, kept only if the user enabled "conserva file originale". */
  data: ArrayBuffer;
  mimeType: string;
  fileName: string;
}

export type OpenPdf = (data: ArrayBuffer) => Promise<PdfDocumentLike>;

const IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/heic', 'image/heif']);

function isPdf(file: File): boolean {
  return file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
}

/** Reads one file chosen by the user. Everything happens on the device. */
export async function ingestFile(file: File, openPdf: OpenPdf): Promise<IngestedFile> {
  if (!isPdf(file)) {
    throw new IngestError(IMAGE_TYPES.has(file.type) ? 'needs-ocr' : 'unsupported-type');
  }
  const data = await file.arrayBuffer();
  let text: PositionedText;
  try {
    // pdf.js takes ownership of the buffer it is given, so it gets a copy.
    text = await pdfToPositionedText(await openPdf(data.slice(0)));
  } catch (error) {
    const name = error instanceof Error ? error.name : '';
    throw new IngestError(name === 'PasswordException' ? 'password' : 'unreadable');
  }
  if (!hasTextLayer(text)) throw new IngestError('needs-ocr');
  return {
    text,
    fileHash: await sha256Hex(data),
    data,
    mimeType: 'application/pdf',
    fileName: file.name,
  };
}
