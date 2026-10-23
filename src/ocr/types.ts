import type { PositionedText } from '../parsers/types';

export interface OcrProgress {
  /** 'loading': the engine and its models are being fetched and started. */
  phase: 'loading' | 'recognizing';
  /** One-based page being read; 0 while loading. */
  page: number;
  pages: number;
  /** 0..1 within the current page; 0 while loading. */
  fraction: number;
}

export interface OcrOptions {
  onProgress?: (progress: OcrProgress) => void;
  signal?: AbortSignal;
}

/** Reads page images into positioned text. tesseract.js on the web; Vision can replace it on iOS. */
export interface OcrEngine {
  recognize(pages: HTMLCanvasElement[], options?: OcrOptions): Promise<PositionedText>;
}

/** The engine, its WASM core or its models could not be loaded: offline on first use, or missing files. */
export class OcrUnavailableError extends Error {
  constructor(cause?: unknown) {
    super('The OCR engine could not be loaded', { cause });
    this.name = 'OcrUnavailableError';
  }
}

// The part of tesseract.js's "blocks" output that to-positioned reads. Coordinates are pixels of
// the recognised image, y growing downwards; confidences are 0..100.
export interface OcrBox {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface OcrWord {
  text: string;
  confidence: number;
  bbox: OcrBox;
}

export interface OcrLine {
  bbox: OcrBox;
  /** From (x0, y0) to (x1, y1): tesseract fits one baseline to the whole line, slightly sloped. */
  baseline: OcrBox;
  rowAttributes?: { rowHeight: number };
  words: OcrWord[];
}

export interface OcrBlock {
  paragraphs: { lines: OcrLine[] }[];
}

/** One page as tesseract.js read it, before to-positioned. `ms`: the time spent recognising it. */
export interface RawOcrPage {
  width: number;
  height: number;
  blocks: OcrBlock[];
  ms: number;
}
