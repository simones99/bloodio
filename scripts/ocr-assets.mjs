// The OCR files the app serves from its own origin under ocr/<hash>/: tesseract.js's worker, the
// three LSTM-only builds of its WASM core (the app picks one by the device's SIMD support; each
// embeds its WASM) and the Italian and English models. scripts/copy-ocr-assets.mjs copies them
// into public/ocr/<hash>/; check:bundle fails when one is missing from dist/ocr/<hash>/.
import { createHash } from 'node:crypto';
import { readFileSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

export const OCR_DIR = 'public/ocr';

/** @type {{ from: [string, string], to: string }[]} */
export const OCR_ASSETS = [
  { from: ['tesseract.js', 'dist/worker.min.js'], to: 'worker.min.js' },
  {
    from: ['tesseract.js-core', 'tesseract-core-lstm.wasm.js'],
    to: 'core/tesseract-core-lstm.wasm.js',
  },
  {
    from: ['tesseract.js-core', 'tesseract-core-simd-lstm.wasm.js'],
    to: 'core/tesseract-core-simd-lstm.wasm.js',
  },
  {
    from: ['tesseract.js-core', 'tesseract-core-relaxedsimd-lstm.wasm.js'],
    to: 'core/tesseract-core-relaxedsimd-lstm.wasm.js',
  },
  {
    from: ['@tesseract.js-data/ita', '4.0.0_best_int/ita.traineddata.gz'],
    to: 'lang/ita.traineddata.gz',
  },
  {
    from: ['@tesseract.js-data/eng', '4.0.0_best_int/eng.traineddata.gz'],
    to: 'lang/eng.traineddata.gz',
  },
];

const require = createRequire(import.meta.url);
// tesseract.js-core is tesseract.js's own dependency: resolve it from there, wherever npm put it.
const fromTesseract = createRequire(require.resolve('tesseract.js/package.json'));

/** @param {{ from: [string, string] }} asset */
export function sourcePath(asset) {
  const [pkg, file] = asset.from;
  const resolver = pkg === 'tesseract.js-core' ? fromTesseract : require;
  return join(dirname(resolver.resolve(`${pkg}/package.json`)), file);
}

/**
 * The first 8 hex characters of a SHA-256 over each file's own SHA-256, in list order: the name
 * of the folder under ocr/. It changes only when one of the files does, so an app update that
 * leaves them alone downloads nothing again, and an old tab never loads newer OCR files.
 * @param {string[]} [paths]
 */
export function ocrHash(paths = OCR_ASSETS.map(sourcePath)) {
  const hash = createHash('sha256');
  for (const path of paths) hash.update(createHash('sha256').update(readFileSync(path)).digest());
  return hash.digest('hex').slice(0, 8);
}

/** @returns {Record<string, number>} each file's size in bytes, by its path under ocr/<hash>/ */
export function ocrSizes() {
  return Object.fromEntries(
    OCR_ASSETS.map((asset) => [asset.to, statSync(sourcePath(asset)).size]),
  );
}

/** The build constants the app reads (src/build-constants.d.ts), for Vite's and Vitest's define. */
export function ocrDefine() {
  return {
    __OCR_HASH__: JSON.stringify(ocrHash()),
    __OCR_SIZES__: JSON.stringify(ocrSizes()),
  };
}
