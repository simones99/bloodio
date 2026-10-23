import { existsSync, mkdtempSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { OCR_ASSETS, ocrDefine, ocrHash, ocrSizes, sourcePath } from '../scripts/ocr-assets.mjs';

describe('OCR assets', () => {
  it('lists the worker, the three LSTM cores and the two models', () => {
    expect(OCR_ASSETS.map((asset) => asset.to)).toEqual([
      'worker.min.js',
      'core/tesseract-core-lstm.wasm.js',
      'core/tesseract-core-simd-lstm.wasm.js',
      'core/tesseract-core-relaxedsimd-lstm.wasm.js',
      'lang/ita.traineddata.gz',
      'lang/eng.traineddata.gz',
    ]);
  });

  it.each(OCR_ASSETS)('finds $to in node_modules', (asset) => {
    expect(existsSync(sourcePath(asset))).toBe(true);
  });
});

describe('ocrHash', () => {
  const dirs: string[] = [];
  afterAll(() => {
    for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
  });

  /** Writes each content to its own file in a fresh temporary folder. */
  function files(...contents: string[]): string[] {
    const dir = mkdtempSync(join(tmpdir(), 'ocr-hash-'));
    dirs.push(dir);
    return contents.map((content, index) => {
      const path = join(dir, `file-${index}`);
      writeFileSync(path, content);
      return path;
    });
  }

  it('is 8 hex characters, the same for the same contents', () => {
    expect(ocrHash(files('a', 'b'))).toMatch(/^[0-9a-f]{8}$/);
    expect(ocrHash(files('a', 'b'))).toBe(ocrHash(files('a', 'b')));
  });

  it('changes when one byte of one file changes', () => {
    expect(ocrHash(files('a', 'b'))).not.toBe(ocrHash(files('a', 'c')));
  });

  it('tells apart contents split differently across files', () => {
    expect(ocrHash(files('ab', 'c'))).not.toBe(ocrHash(files('a', 'bc')));
  });
});

describe('ocrSizes', () => {
  it('gives the size in bytes of every asset, by its path under ocr/<hash>/', () => {
    const sizes = ocrSizes();
    expect(Object.keys(sizes)).toEqual(OCR_ASSETS.map((asset) => asset.to));
    for (const asset of OCR_ASSETS) expect(sizes[asset.to]).toBe(statSync(sourcePath(asset)).size);
  });
});

describe('ocrDefine', () => {
  it('passes the hash and the sizes of the real files to the code', () => {
    expect(ocrDefine()).toEqual({
      __OCR_HASH__: JSON.stringify(ocrHash()),
      __OCR_SIZES__: JSON.stringify(ocrSizes()),
    });
    // vitest.config.ts defines the same values for the code under test.
    expect(__OCR_HASH__).toBe(ocrHash());
    expect(__OCR_SIZES__).toEqual(ocrSizes());
  });
});
