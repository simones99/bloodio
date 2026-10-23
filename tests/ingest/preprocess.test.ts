import { describe, expect, it } from 'vitest';
import {
  estimateSkew,
  flattenBackground,
  grayToRgba,
  MIN_SKEW_DEGREES,
  PREPROCESS_STEPS,
  rgbaToGray,
  sauvola,
  type GrayImage,
} from '../../src/ingest/preprocess';

function image(width: number, height: number, value: (x: number, y: number) => number): GrayImage {
  const data = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) data[y * width + x] = Math.round(value(x, y));
  }
  return { width, height, data };
}

const at = (img: GrayImage, x: number, y: number) => img.data[y * img.width + x]!;

/** Dark squares of `size` pixels every `step` pixels, starting at `step / 2`. */
const inSquare = (x: number, y: number, size: number, step: number) =>
  (x % step) - step / 2 >= 0 &&
  (x % step) - step / 2 < size &&
  (y % step) - step / 2 >= 0 &&
  (y % step) - step / 2 < size;

describe('grayToRgba', () => {
  it('writes opaque grey pixels from the offset and round-trips with rgbaToGray', () => {
    const gray = image(4, 2, (x, y) => x * 60 + y * 5);
    const rgba = new Uint8ClampedArray(4 * 4);
    grayToRgba(gray, 4, rgba);
    expect(Array.from(rgba.slice(0, 8))).toEqual([5, 5, 5, 255, 65, 65, 65, 255]);
    expect(rgba.every((v, i) => i % 4 !== 3 || v === 255)).toBe(true);
    const back = new Uint8Array(8);
    rgbaToGray(rgba, back, 4);
    expect(Array.from(back.slice(4))).toEqual(Array.from(gray.data.slice(4)));
  });
});

describe('rgbaToGray', () => {
  it('writes the luma of each pixel at the offset', () => {
    const target = new Uint8Array(4);
    rgbaToGray([255, 255, 255, 255, 0, 0, 0, 255, 255, 0, 0, 255], target, 1);
    expect([...target]).toEqual([0, 255, 0, 76]);
  });
});

describe('flattenBackground', () => {
  // Paper from 120 on the left to 240 on the right, text at 30% of the paper under it.
  const paper = (x: number) => 120 + (120 * x) / 800;
  const page = () => image(800, 600, (x, y) => (inSquare(x, y, 8, 40) ? paper(x) * 0.3 : paper(x)));

  it('turns a gradient into a uniform white paper', () => {
    const flat = flattenBackground(page());
    for (const [x, y] of [
      [5, 5],
      [400, 300],
      [795, 595],
      [200, 590],
    ] as const) {
      expect(at(flat, x, y), `${x},${y}`).toBeGreaterThanOrEqual(235);
    }
  });

  it('works on a page that is not a multiple of four', () => {
    const flat = flattenBackground(image(803, 602, () => 180));
    expect(at(flat, 802, 601)).toBe(255);
    expect(at(flat, 0, 0)).toBe(255);
  });

  it('keeps the text dark', () => {
    const flat = flattenBackground(page());
    expect(at(flat, 24, 24)).toBeLessThan(128);
    expect(at(flat, 784, 584)).toBeLessThan(128);
  });
});

describe('sauvola', () => {
  // Paper from 60 to 230, text at half the paper under it: one global threshold cannot split both.
  const paper = (x: number) => 60 + (170 * x) / 800;
  const page = () =>
    image(800, 600, (x, y) => (inSquare(x, y, 12, 48) ? paper(x) * 0.5 : paper(x)));

  it('makes the text black and the paper white, in the dark and the light part', () => {
    const binary = sauvola(page());
    // Square centres: 24 + 6 = 30 from the start of each 48-pixel cell.
    expect(at(binary, 30, 30)).toBe(0);
    expect(at(binary, 750, 558)).toBe(0);
    // Paper at least 8 pixels from any square.
    expect(at(binary, 8, 8)).toBe(255);
    expect(at(binary, 776, 584)).toBe(255);
  });

  it('keeps faint one- and two-pixel strokes as ink', () => {
    // Horizontal strokes 1 and 2 pixels thick (value 150) on paper 230.
    const strokes = image(803, 603, (_x, y) => (y === 20 || y === 60 || y === 61 ? 150 : 230));
    const binary = sauvola(strokes);
    expect(at(binary, 300, 20)).toBe(0);
    expect(at(binary, 300, 60)).toBe(0);
    expect(at(binary, 300, 61)).toBe(0);
    expect(at(binary, 300, 30)).toBe(255);
  });

  it('works on a page that is not a multiple of four', () => {
    const binary = sauvola(image(803, 602, (x, y) => (inSquare(x, y, 12, 48) ? 60 : 230)));
    expect(binary.data.length).toBe(803 * 602);
    expect(at(binary, 790, 590)).toBe(255);
    expect(at(binary, 30, 30)).toBe(0);
  });

  it('leaves only black and white', () => {
    const binary = sauvola(page());
    expect(new Set(binary.data)).toEqual(new Set([0, 255]));
  });
});

describe('estimateSkew', () => {
  /** Twenty 4-pixel lines sloping by `degrees`, y growing downwards. */
  const lines = (degrees: number) => {
    const slope = Math.tan((degrees * Math.PI) / 180);
    const img = image(2000, 1400, () => 255);
    for (let i = 0; i < 20; i++) {
      for (let x = 100; x < 1900; x++) {
        const y = Math.round(100 + 60 * i + x * slope);
        for (let t = 0; t < 4; t++) {
          if (y + t >= 0 && y + t < img.height) img.data[(y + t) * img.width + x] = 0;
        }
      }
    }
    return img;
  };

  it.each([2, -1.3, 4.5])('finds a slope of %s degrees within 0.2', (degrees) => {
    expect(Math.abs(estimateSkew(lines(degrees)) - degrees)).toBeLessThanOrEqual(0.2);
  });

  it('finds a level page level', () => {
    expect(Math.abs(estimateSkew(lines(0)))).toBeLessThan(MIN_SKEW_DEGREES);
  });

  /** The level lines turned by `degrees` about the centre, as a canvas rotate(degrees) would draw them. */
  const rotatedLines = (degrees: number) => {
    const level = lines(0);
    const { width, height } = level;
    const cos = Math.cos((degrees * Math.PI) / 180);
    const sin = Math.sin((degrees * Math.PI) / 180);
    return image(width, height, (x, y) => {
      const dx = x - width / 2;
      const dy = y - height / 2;
      const sx = Math.round(dx * cos + dy * sin + width / 2);
      const sy = Math.round(-dx * sin + dy * cos + height / 2);
      return sx >= 0 && sx < width && sy >= 0 && sy < height ? level.data[sy * width + sx]! : 255;
    });
  };

  it.each([2, -1.5])('finds a rotation of %s degrees within 0.1', (degrees) => {
    expect(Math.abs(estimateSkew(rotatedLines(degrees)) - degrees)).toBeLessThanOrEqual(0.1);
  });

  it('gives 0 for a single vertical rule', () => {
    const rule = image(800, 600, (x) => (x >= 400 && x < 403 ? 0 : 255));
    expect(estimateSkew(rule)).toBe(0);
  });

  it('gives 0 for a small blob on a blank page', () => {
    const blob = image(800, 600, (x, y) => (x >= 300 && x < 310 && y >= 200 && y < 210 ? 0 : 255));
    expect(estimateSkew(blob)).toBe(0);
  });

  it('gives 0 for a ring stamp on a blank page', () => {
    const stamp = image(800, 600, (x, y) => {
      const r = Math.hypot(x - 400, y - 300);
      return r >= 118 && r < 122 ? 0 : 255;
    });
    expect(estimateSkew(stamp)).toBe(0);
  });

  it('gives 0 for a blank page', () => {
    expect(estimateSkew(image(400, 300, () => 255))).toBe(0);
  });
});

describe('PREPROCESS_STEPS', () => {
  it('lists only known steps, each once', () => {
    expect(new Set(PREPROCESS_STEPS).size).toBe(PREPROCESS_STEPS.length);
    for (const step of PREPROCESS_STEPS) expect(['light', 'deskew', 'binarize']).toContain(step);
  });
});
