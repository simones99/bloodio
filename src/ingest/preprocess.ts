// Pure image steps for OCR pages (spec 2026-10-16 §4), with no DOM so they run in Vitest. A page is
// up to 12 MP: the steps overwrite the image they get, and keep their statistics on a working copy
// at a quarter of the resolution, interpolated back.

/** One 8-bit channel, row by row. */
export interface GrayImage {
  width: number;
  height: number;
  data: Uint8Array;
}

/** A small working copy, a quarter of the resolution or less: floats cost little there. */
interface Plane {
  width: number;
  height: number;
  data: Float64Array;
}

export type PreprocessStep = 'light' | 'deskew' | 'binarize';

/** The steps the app applies, always in the order light, deskew, binarize. Chosen by measurement (§4.2). */
export const PREPROCESS_STEPS: readonly PreprocessStep[] = ['light', 'deskew'];

/** Below this a page is left as it is: rotating blurs the text a little. */
export const MIN_SKEW_DEGREES = 0.3;
const MAX_SKEW_DEGREES = 5;
const STATS_FACTOR = 4;
/**
 * A turn is proposed only when it sharpens the rows by this factor over leaving the page as it is.
 * Measured: real tilts of 0.4° to 3°, sparse or dense, beat 0° by at least 1.25; ink with no lines
 * (a stamp, a blob) scores 1.0 to 1.02. Known blind spot: a page with a single straight slanted
 * stroke (a signature) scores about 1.42 and would be turned; not a realistic OCR page.
 */
const SKEW_GAIN = 1.15;
/** estimateSkew works on a copy whose long side is at most this. */
const SKEW_SIDE = 1000;
/** flattenBackground: the paper is the lightest value within short side / this, at stats resolution. */
const PAPER_DIVISOR = 150;
/** flattenBackground: then averaged within short side / this. */
const BACKGROUND_DIVISOR = 20;
/** Sauvola's k, and its window radius as short side / this, at stats resolution. */
const SAUVOLA_K = 0.2;
const SAUVOLA_DIVISOR = 40;

/**
 * The numbers that change what the steps write, for the fingerprint of the reading pipeline
 * (src/ocr/reading-fingerprint.ts). A new tuning number belongs here too.
 */
export const PREPROCESS_PARAMS = Object.freeze({
  statsFactor: STATS_FACTOR,
  paperDivisor: PAPER_DIVISOR,
  backgroundDivisor: BACKGROUND_DIVISOR,
  sauvolaK: SAUVOLA_K,
  sauvolaDivisor: SAUVOLA_DIVISOR,
  skewSide: SKEW_SIDE,
  minSkewDegrees: MIN_SKEW_DEGREES,
  maxSkewDegrees: MAX_SKEW_DEGREES,
  skewGain: SKEW_GAIN,
});

/** Writes the luma of RGBA pixels into `target` from `offset`. Alpha is ignored: canvases are opaque. */
export function rgbaToGray(rgba: ArrayLike<number>, target: Uint8Array, offset: number): void {
  for (let i = 0, p = offset; i + 3 < rgba.length; i += 4, p++) {
    target[p] = (77 * rgba[i]! + 150 * rgba[i + 1]! + 29 * rgba[i + 2]!) >> 8;
  }
}

/**
 * Writes opaque grey RGBA pixels into `target` (length a multiple of 4), reading `image.data` from
 * `offset`. The inverse of rgbaToGray on grey pixels.
 */
export function grayToRgba(image: GrayImage, offset: number, target: Uint8ClampedArray): void {
  for (let i = 0, p = offset; i + 3 < target.length; i += 4, p++) {
    const value = image.data[p]!;
    target[i] = value;
    target[i + 1] = value;
    target[i + 2] = value;
    target[i + 3] = 255;
  }
}

/** Mean of each factor × factor block, and of its squares when asked; edge blocks average what they have. */
function downscale(image: GrayImage, factor: number, withSquares = false) {
  const width = Math.ceil(image.width / factor);
  const height = Math.ceil(image.height / factor);
  const sums = new Float64Array(width * height);
  const squares = withSquares ? new Float64Array(width * height) : null;
  const column = new Int32Array(image.width);
  for (let x = 0; x < image.width; x++) column[x] = Math.floor(x / factor);
  for (let y = 0; y < image.height; y++) {
    const row = Math.floor(y / factor) * width;
    const source = y * image.width;
    for (let x = 0; x < image.width; x++) {
      const cell = row + column[x]!;
      const v = image.data[source + x]!;
      sums[cell] = sums[cell]! + v;
      if (squares) squares[cell] = squares[cell]! + v * v;
    }
  }
  for (let cy = 0; cy < height; cy++) {
    const rows = Math.min(factor, image.height - cy * factor);
    for (let cx = 0; cx < width; cx++) {
      const count = rows * Math.min(factor, image.width - cx * factor);
      const cell = cy * width + cx;
      sums[cell] = sums[cell]! / count;
      if (squares) squares[cell] = squares[cell]! / count;
    }
  }
  const mean: Plane = { width, height, data: sums };
  return { mean, squares: squares && ({ width, height, data: squares } as Plane) };
}

/** The lightest value within `radius`, horizontally then vertically. */
function maxFilter(plane: Plane, radius: number): Plane {
  const { width, height, data } = plane;
  const across = new Float64Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let best = 0;
      const end = Math.min(width - 1, x + radius);
      for (let i = Math.max(0, x - radius); i <= end; i++)
        best = Math.max(best, data[y * width + i]!);
      across[y * width + x] = best;
    }
  }
  const out = new Float64Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let best = 0;
      const end = Math.min(height - 1, y + radius);
      for (let j = Math.max(0, y - radius); j <= end; j++)
        best = Math.max(best, across[j * width + x]!);
      out[y * width + x] = best;
    }
  }
  return { width, height, data: out };
}

/** Mean within `radius`, from a summed-area table; windows on the edges average what they have. */
function boxMean(plane: Plane, radius: number): Plane {
  const { width, height, data } = plane;
  const stride = width + 1;
  const table = new Float64Array(stride * (height + 1));
  for (let y = 0; y < height; y++) {
    let row = 0;
    for (let x = 0; x < width; x++) {
      row += data[y * width + x]!;
      table[(y + 1) * stride + x + 1] = table[y * stride + x + 1]! + row;
    }
  }
  const out = new Float64Array(width * height);
  for (let y = 0; y < height; y++) {
    const y0 = Math.max(0, y - radius);
    const y1 = Math.min(height, y + radius + 1);
    for (let x = 0; x < width; x++) {
      const x0 = Math.max(0, x - radius);
      const x1 = Math.min(width, x + radius + 1);
      const sum =
        table[y1 * stride + x1]! -
        table[y0 * stride + x1]! -
        table[y1 * stride + x0]! +
        table[y0 * stride + x0]!;
      out[y * width + x] = sum / ((x1 - x0) * (y1 - y0));
    }
  }
  return { width, height, data: out };
}

/** Per full-resolution column: the two small columns it lies between, and the weight of the second. */
function columnTable(plane: Plane, factor: number, width: number) {
  const left = new Int32Array(width);
  const right = new Int32Array(width);
  const weight = new Float64Array(width);
  for (let x = 0; x < width; x++) {
    const f = Math.min(plane.width - 1, Math.max(0, (x + 0.5) / factor - 0.5));
    const x0 = Math.floor(f);
    left[x] = x0;
    right[x] = Math.min(plane.width - 1, x0 + 1);
    weight[x] = f - x0;
  }
  return { left, right, weight };
}

/**
 * Fills `buffer` (one entry per small column) with the plane interpolated vertically at
 * full-resolution row `y`; a pixel's value is then a horizontal blend of two entries.
 */
function interpolateRow(plane: Plane, factor: number, y: number, buffer: Float64Array): void {
  const f = Math.min(plane.height - 1, Math.max(0, (y + 0.5) / factor - 0.5));
  const y0 = Math.floor(f);
  const y1 = Math.min(plane.height - 1, y0 + 1);
  const t = f - y0;
  const w = plane.width;
  for (let x = 0; x < w; x++) {
    buffer[x] = plane.data[y0 * w + x]! * (1 - t) + plane.data[y1 * w + x]! * t;
  }
}

/**
 * Evens out the light (§4.1, step 1): divides each pixel by an estimate of the paper under it, so
 * a shadow or a gradient becomes white paper. The lightest nearby value comes first, or the text
 * would darken the estimate. Solid dark blocks taller than about 330 px (a dark band with white
 * text) are taken for shadow and turn white. Overwrites `image`.
 */
export function flattenBackground(image: GrayImage): GrayImage {
  const small = downscale(image, STATS_FACTOR).mean;
  const side = Math.min(small.width, small.height);
  const paper = maxFilter(small, Math.max(1, Math.round(side / PAPER_DIVISOR)));
  const background = boxMean(paper, Math.max(2, Math.round(side / BACKGROUND_DIVISOR)));
  const { width, height, data } = image;
  const columns = columnTable(background, STATS_FACTOR, width);
  const buffer = new Float64Array(background.width);
  for (let y = 0; y < height; y++) {
    interpolateRow(background, STATS_FACTOR, y, buffer);
    for (let x = 0; x < width; x++) {
      const t = columns.weight[x]!;
      const light = Math.max(
        1,
        buffer[columns.left[x]!]! * (1 - t) + buffer[columns.right[x]!]! * t,
      );
      const p = y * width + x;
      const v = Math.floor((data[p]! * 255) / light + 0.5);
      data[p] = v > 255 ? 255 : v;
    }
  }
  return image;
}

/**
 * Sauvola's local threshold (§4.1, step 2): T = m · (1 + k · (s / 128 − 1)) from the mean m and the
 * deviation s around each pixel. Overwrites `image` with 0 and 255.
 */
export function sauvola(image: GrayImage, k = SAUVOLA_K): GrayImage {
  const blocks = downscale(image, STATS_FACTOR, true);
  const small = blocks.mean;
  const radius = Math.max(2, Math.round(Math.min(small.width, small.height) / SAUVOLA_DIVISOR));
  const mean = boxMean(small, radius);
  const squares = boxMean(blocks.squares!, radius);
  const limits = new Float64Array(mean.data.length);
  for (let i = 0; i < limits.length; i++) {
    const m = mean.data[i]!;
    const deviation = Math.sqrt(Math.max(0, squares.data[i]! - m * m));
    limits[i] = m * (1 + k * (deviation / 128 - 1));
  }
  const limit: Plane = { width: small.width, height: small.height, data: limits };
  const { width, height, data } = image;
  const columns = columnTable(limit, STATS_FACTOR, width);
  const buffer = new Float64Array(limit.width);
  for (let y = 0; y < height; y++) {
    interpolateRow(limit, STATS_FACTOR, y, buffer);
    for (let x = 0; x < width; x++) {
      const t = columns.weight[x]!;
      const threshold = buffer[columns.left[x]!]! * (1 - t) + buffer[columns.right[x]!]! * t;
      const p = y * width + x;
      data[p] = data[p]! > threshold ? 255 : 0;
    }
  }
  return image;
}

/** Otsu's threshold: the grey level that best splits ink from paper. */
function otsu(plane: Plane): number {
  const histogram = new Float64Array(256);
  for (const value of plane.data) {
    const bin = Math.min(255, Math.max(0, Math.round(value)));
    histogram[bin] = histogram[bin]! + 1;
  }
  const total = plane.data.length;
  let sum = 0;
  for (let t = 0; t < 256; t++) sum += t * histogram[t]!;
  let weightDark = 0;
  let sumDark = 0;
  let best = -1;
  let cut = 128;
  for (let t = 0; t < 256; t++) {
    weightDark += histogram[t]!;
    if (weightDark === 0) continue;
    const weightLight = total - weightDark;
    if (weightLight === 0) break;
    sumDark += t * histogram[t]!;
    const between =
      weightDark * weightLight * (sumDark / weightDark - (sum - sumDark) / weightLight) ** 2;
    if (between > best) {
      best = between;
      cut = t;
    }
  }
  return cut + 0.5;
}

/**
 * The slope of the text lines in degrees, y growing downwards (§4.1, step 3): the angle, within
 * ±5°, that makes the rows of ink sharpest when projected sideways. 0 for a page with almost no ink.
 */
export function estimateSkew(image: GrayImage): number {
  const factor = Math.max(1, Math.ceil(Math.max(image.width, image.height) / SKEW_SIDE));
  const small = downscale(image, factor).mean;
  const cut = otsu(small);
  const xs: number[] = [];
  const ys: number[] = [];
  for (let y = 0; y < small.height; y++) {
    for (let x = 0; x < small.width; x++) {
      if (small.data[y * small.width + x]! < cut) {
        xs.push(x);
        ys.push(y);
      }
    }
  }
  if (xs.length < 50) return 0;

  // Room for the projections of the steepest angle tried, 5.5°, on both sides.
  const shift = Math.ceil(small.width * Math.tan((6 * Math.PI) / 180)) + 1;
  const bins = new Float64Array(small.height + 2 * shift + 1);
  const sharpness = (degrees: number) => {
    const slope = Math.tan((degrees * Math.PI) / 180);
    bins.fill(0);
    for (let i = 0; i < xs.length; i++) {
      const bin = Math.round(ys[i]! - xs[i]! * slope) + shift;
      bins[bin] = bins[bin]! + 1;
    }
    let total = 0;
    for (const count of bins) total += count * count;
    return total;
  };
  // Angles are tried by growing |angle| and only a strictly higher score wins, so ties keep the smaller turn.
  const bestOf = (angles: number[]) => {
    let best = 0;
    let bestScore = -1;
    for (const angle of [...angles].sort((p, q) => Math.abs(p) - Math.abs(q))) {
      const score = sharpness(angle);
      if (score > bestScore) {
        bestScore = score;
        best = angle;
      }
    }
    return best;
  };

  const steps = 2 * MAX_SKEW_DEGREES * 2;
  const coarse = bestOf(Array.from({ length: steps + 1 }, (_, i) => -MAX_SKEW_DEGREES + i * 0.5));
  const fine = bestOf(
    Array.from({ length: 11 }, (_, i) => coarse - 0.5 + i * 0.1).filter(
      (angle) => Math.abs(angle) <= MAX_SKEW_DEGREES + 1e-9,
    ),
  );
  // Ink with no lines in it (a rule, a blob) scores about the same at every angle: turn only for a clear gain.
  if (sharpness(fine) <= sharpness(0) * SKEW_GAIN) return 0;
  const clamped = Math.max(-MAX_SKEW_DEGREES, Math.min(MAX_SKEW_DEGREES, fine));
  return Math.round(clamped * 10) / 10;
}
