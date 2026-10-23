// Browser-only: tesseract.js reads in its own worker, with the worker script, the WASM core and the
// models served from the app's origin under ocr/<hash>/ (src/ocr/assets.ts). Loaded lazily, only
// when a scan or a photo is chosen. Offline, the service worker serves them from the cache that
// src/pwa/ocr-offline.ts fills.
import { createWorker } from 'tesseract.js';
import {
  assetsAvailable,
  OCR_ENGINE_MODE,
  OCR_LANG_DIR,
  OCR_LANGUAGES,
  OCR_WORKER,
  ocrAssetUrl,
  pickCore,
  requiredAssets,
} from './assets';
import { blocksToPage } from './to-positioned';
import { OcrUnavailableError, type OcrEngine, type OcrOptions, type RawOcrPage } from './types';

/** Rejects with the signal's reason once it aborts; never settles otherwise. */
function whenAborted(signal: AbortSignal | undefined): Promise<never> {
  const aborted = new Promise<never>((_, reject) => {
    if (!signal) return;
    if (signal.aborted) reject(signal.reason);
    signal.addEventListener('abort', () => reject(signal.reason), { once: true });
  });
  // Handled here so an abort after the reading has finished is not an unhandled rejection.
  aborted.catch(() => {});
  return aborted;
}

export interface TesseractEngine extends OcrEngine {
  /** tesseract.js's output for each page, before conversion: the measuring page converts it itself. */
  recognizeRaw(pages: HTMLCanvasElement[], options?: OcrOptions): Promise<RawOcrPage[]>;
}

export function createTesseractEngine(): TesseractEngine {
  async function recognizeRaw(
    pages: HTMLCanvasElement[],
    { onProgress, signal }: OcrOptions = {},
  ): Promise<RawOcrPage[]> {
    signal?.throwIfAborted();
    const aborted = whenAborted(signal);
    const total = pages.length;
    onProgress?.({ phase: 'loading', page: 0, pages: total, fraction: 0 });

    // Without WebAssembly (iOS Lockdown Mode, hardened browsers) or without the detection chunk,
    // OCR cannot run: unavailable, not an unreadable file. Raced so a cancel is not held up.
    const core = await Promise.race([
      pickCore().catch((error: unknown) => {
        throw new OcrUnavailableError(error);
      }),
      aborted,
    ]);
    // Fail fast without starting a worker when the files are missing or the device is offline
    // without them in the cache: tesseract.js waits forever when a model fails to load.
    const available = await Promise.race([
      assetsAvailable(
        requiredAssets(core).map((path) => ocrAssetUrl(path)),
        {
          // navigator.serviceWorker is undefined outside secure contexts, whatever the DOM types say.
          controlled: Boolean(navigator.serviceWorker?.controller),
          caches: typeof caches === 'undefined' ? undefined : caches,
          fetch: (input, init) => fetch(input, init),
          signal,
        },
      ),
      aborted,
    ]);
    if (!available) throw new OcrUnavailableError();

    let page = 0;
    let fail: (error: unknown) => void = () => {};
    const failed = new Promise<never>((_, reject) => {
      fail = reject;
    });
    failed.catch(() => {});
    const starting = createWorker(OCR_LANGUAGES, OCR_ENGINE_MODE, {
      workerPath: ocrAssetUrl(OCR_WORKER),
      // A file, not a folder: tesseract.js loads it as is and skips its own SIMD detection, so the
      // build is the one the background download cached.
      corePath: ocrAssetUrl(`core/${core}`),
      langPath: ocrAssetUrl(OCR_LANG_DIR),
      workerBlobURL: false,
      gzip: true,
      // No IndexedDB copy of the models: a second cache that "Elimina tutti i dati" knows nothing about.
      cacheMethod: 'none',
      // A startup failure never settles createWorker's promise; once started, a failure here is
      // harmless because recognize's own promise rejects.
      errorHandler: fail,
      logger: (message) => {
        if (message.status === 'recognizing text' && page > 0) {
          onProgress?.({ phase: 'recognizing', page, pages: total, fraction: message.progress });
        }
      },
    });
    try {
      const worker = await Promise.race([
        Promise.race([starting, failed]).catch((error: unknown) => {
          throw new OcrUnavailableError(error);
        }),
        aborted,
      ]);
      const read: RawOcrPage[] = [];
      for (const [index, canvas] of pages.entries()) {
        page = index + 1;
        onProgress?.({ phase: 'recognizing', page, pages: total, fraction: 0 });
        const start = performance.now();
        const { data } = await Promise.race([
          worker.recognize(canvas, {}, { blocks: true }),
          aborted,
        ]);
        read.push({
          width: canvas.width,
          height: canvas.height,
          blocks: data.blocks ?? [],
          ms: performance.now() - start,
        });
      }
      return read;
    } finally {
      // Also when the user cancels while the worker is still starting. If startup fails after the
      // probe, tesseract.js gives no handle to terminate the worker.
      void starting.then((worker) => worker.terminate()).catch(() => {});
    }
  }

  return {
    recognizeRaw,
    async recognize(pages, options) {
      const read = await recognizeRaw(pages, options);
      return {
        source: 'ocr',
        pages: read.map((page) => blocksToPage(page.blocks, page.width, page.height)),
      };
    },
  };
}
