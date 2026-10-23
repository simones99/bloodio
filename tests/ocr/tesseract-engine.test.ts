import { describe, expect, it, vi } from 'vitest';
import { createTesseractEngine } from '../../src/ocr/tesseract-engine';
import { OcrUnavailableError } from '../../src/ocr/types';

vi.mock('tesseract.js', () => ({ createWorker: vi.fn() }));
vi.mock('../../src/ocr/assets', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/ocr/assets')>()),
  pickCore: () => Promise.reject(new ReferenceError('WebAssembly is not defined')),
}));

describe('the Tesseract engine', () => {
  it('reports OCR unavailable, not an unreadable file, when the core detection fails', async () => {
    const { createWorker } = await import('tesseract.js');
    await expect(createTesseractEngine().recognize([], {})).rejects.toBeInstanceOf(
      OcrUnavailableError,
    );
    expect(createWorker).not.toHaveBeenCalled();
  });
});
