import { afterEach, describe, expect, it, vi } from 'vitest';
import { IngestError } from '../../src/ingest/ingest-file';
import { MAX_SIDE, PDF_SCALE, createPageRenderer, pageScale } from '../../src/ingest/image-pages';

describe('pageScale', () => {
  it('renders a PDF page at about 300 DPI', () => {
    expect(PDF_SCALE).toBeCloseTo(300 / 72);
    expect(pageScale(612, 792, PDF_SCALE)).toBeCloseTo(300 / 72);
  });

  it('caps the long side at 3500 pixels', () => {
    expect(MAX_SIDE).toBe(3500);
    // An A3 page at 300 DPI would be about 7000 pixels high.
    expect(1684 * pageScale(1191, 1684, PDF_SCALE)).toBeCloseTo(3500);
  });

  it('never enlarges a photo', () => {
    expect(pageScale(1200, 1600, 1)).toBe(1);
  });

  it('shrinks a 12-megapixel photo to fit', () => {
    expect(4000 * pageScale(3000, 4000, 1)).toBeCloseTo(3500);
  });
});

describe('createPageRenderer images', () => {
  afterEach(() => vi.unstubAllGlobals());

  const stubCanvas = () =>
    vi.stubGlobal('document', {
      createElement: () => ({
        width: 0,
        height: 0,
        getContext: () => ({ fillRect: () => undefined, drawImage: () => undefined }),
      }),
    });

  it('retries without options when the browser rejects imageOrientation with a TypeError', async () => {
    stubCanvas();
    const bitmap = { width: 100, height: 50, close: vi.fn() };
    const create = vi.fn((_file: File, options?: unknown) =>
      options ? Promise.reject(new TypeError('bad value')) : Promise.resolve(bitmap),
    );
    vi.stubGlobal('createImageBitmap', create);
    // No pre-processing: the stub canvas only draws, and this test is about decoding.
    const canvases = await createPageRenderer([]).fromImages([new File(['x'], 'a.jpg')]);
    expect(canvases).toHaveLength(1);
    expect(create).toHaveBeenCalledTimes(2);
    expect(bitmap.close).toHaveBeenCalled();
  });

  it('maps a real decode failure to unreadable, and to heic-unsupported for HEIC', async () => {
    vi.stubGlobal('createImageBitmap', () =>
      Promise.reject(new DOMException('x', 'InvalidStateError')),
    );
    const renderer = createPageRenderer();
    await expect(renderer.fromImages([new File(['x'], 'a.jpg')])).rejects.toEqual(
      new IngestError('unreadable'),
    );
    await expect(renderer.fromImages([new File(['x'], 'a.heic')])).rejects.toEqual(
      new IngestError('heic-unsupported'),
    );
  });
});
