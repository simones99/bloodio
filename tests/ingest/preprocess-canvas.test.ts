import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { preprocessCanvas } from '../../src/ingest/preprocess-canvas';

/** Just enough of a 2D canvas for preprocessCanvas: grey pixels read and written in strips. */
class FakeCanvas {
  pixels: Uint8Array;
  constructor(
    public width: number,
    public height: number,
  ) {
    this.pixels = new Uint8Array(width * height).fill(255);
  }
  getContext() {
    return {
      fillStyle: '',
      imageSmoothingQuality: '',
      fillRect: () => undefined,
      translate: () => undefined,
      rotate: () => undefined,
      drawImage: () => undefined,
      getImageData: (_x: number, top: number, width: number, rows: number) => {
        const data = new Uint8ClampedArray(width * rows * 4);
        for (let p = 0; p < width * rows; p++) {
          data.fill(this.pixels[top * width + p]!, p * 4, p * 4 + 3);
          data[p * 4 + 3] = 255;
        }
        return { data };
      },
      createImageData: (width: number, height: number) => ({
        width,
        height,
        data: new Uint8ClampedArray(width * height * 4),
      }),
      putImageData: (
        image: { width: number; data: Uint8ClampedArray },
        _x: number,
        top: number,
      ) => {
        for (let p = 0; p < image.data.length / 4; p++) {
          this.pixels[top * image.width + p] = image.data[p * 4]!;
        }
      },
    };
  }
}

/** Twenty 4-pixel lines sloping by `degrees`, y growing downwards, like text rows on a page. */
function linesPage(degrees: number) {
  const page = new FakeCanvas(2000, 1400);
  const slope = Math.tan((degrees * Math.PI) / 180);
  for (let i = 0; i < 20; i++) {
    for (let x = 100; x < 1900; x++) {
      const y = Math.round(100 + 60 * i + x * slope);
      for (let t = 0; t < 4; t++) page.pixels[(y + t) * page.width + x] = 0;
    }
  }
  return page;
}

const asCanvas = (canvas: FakeCanvas) => canvas as unknown as HTMLCanvasElement;

describe('preprocessCanvas', () => {
  beforeEach(() =>
    vi.stubGlobal('document', {
      createElement: () => new FakeCanvas(2000, 1400),
    }),
  );
  afterEach(() => vi.unstubAllGlobals());

  it('returns the deskew angle it applied, on a new canvas', () => {
    const page = linesPage(2);
    const result = preprocessCanvas(asCanvas(page), ['deskew']);
    expect(Math.abs(result.skewDegrees - 2)).toBeLessThanOrEqual(0.2);
    expect(result.canvas).not.toBe(page);
    // The input is consumed: released once the turned copy exists.
    expect([page.width, page.height]).toEqual([0, 0]);
  });

  it('returns 0 for a level page, which it leaves where it is', () => {
    const page = linesPage(0);
    const result = preprocessCanvas(asCanvas(page), ['deskew']);
    expect(result).toEqual({ canvas: page, skewDegrees: 0 });
  });

  it('returns 0 below MIN_SKEW_DEGREES, where it does not turn the page', () => {
    const page = linesPage(0.15);
    expect(preprocessCanvas(asCanvas(page), ['deskew'])).toEqual({ canvas: page, skewDegrees: 0 });
  });

  it('returns 0 when deskew is not among the steps, however tilted the page', () => {
    const page = linesPage(2);
    expect(preprocessCanvas(asCanvas(page), ['light']).skewDegrees).toBe(0);
    expect(preprocessCanvas(asCanvas(page), [])).toEqual({ canvas: page, skewDegrees: 0 });
  });
});
