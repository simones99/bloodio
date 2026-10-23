// Development-only page (spec 2026-10-16 §3.1), served by Vite and never built: reads images with
// the app's own pipeline and compares the result with the fixture they were drawn or photographed
// from. scripts/measure-ocr.mjs drives it through window.measure.
import { createPageRenderer } from '../../src/ingest/image-pages';
import { PREPROCESS_STEPS, type PreprocessStep } from '../../src/ingest/preprocess';
import { preprocessCanvas } from '../../src/ingest/preprocess-canvas';
import { READING_SETTINGS, readingFingerprint } from '../../src/ocr/reading-fingerprint';
import { createTesseractEngine } from '../../src/ocr/tesseract-engine';
import { blocksToPage, WORD_GAP_RATIO } from '../../src/ocr/to-positioned';
import { parseAstRows } from '../../src/parsers/ast';
import {
  lineOffset,
  REF_ALIGN_TOLERANCE,
  UNIT_ALIGN_TOLERANCE,
  VALUE_ALIGN_TOLERANCE,
} from '../../src/parsers/layout';
import { parseProavisRows } from '../../src/parsers/proavis';
import { detectAdapter, parseReport } from '../../src/parsers/registry';
import type { BBox, PositionedText, RawRow, TextItem } from '../../src/parsers/types';
import {
  compareReports,
  cutRowOutcomes,
  type Comparison,
  type CutRow,
  type RowResult,
} from './compare';
import { lowestThreshold } from './criterion';

export interface MeasureImage {
  name: string;
  mimeType: string;
  base64: string;
}

export interface MeasureInput {
  /** The pages of one shot, in order. */
  images: MeasureImage[];
  /** The fixture the shot shows: its text layer, the truth. */
  truth: PositionedText;
  steps: PreprocessStep[];
  /** Word join ratios to convert the same reading with. */
  ratios: number[];
}

/**
 * One row as the lab adapter cut it from the reading, with how far its value, unit and reference
 * sit from the name's baseline, in name heights: what VALUE_ALIGN_TOLERANCE and
 * UNIT_ALIGN_TOLERANCE in src/parsers/layout.ts are re-checked against.
 */
export interface AlignmentRow {
  page: number;
  name: string;
  value: string;
  /** RawRow.aligned; null when the adapter does not say (a row without a value). */
  aligned: boolean | null;
  /** null when the field is empty or its text is not one item of the page near the name. */
  offsets: { value: number | null; unit: number | null; ref: number | null };
}

export interface MeasureOutput {
  preprocessMs: number[];
  recognizeMs: number[];
  byRatio: {
    ratio: number;
    comparison: Comparison;
    /** null when the reading went to the generic adapter, which never sets `aligned`. */
    alignment: AlignmentRow[] | null;
  }[];
}

function toFile(image: MeasureImage): File {
  const bytes = Uint8Array.from(atob(image.base64), (c) => c.charCodeAt(0));
  return new File([bytes], image.name, { type: image.mimeType });
}

const EPSILON = 0.5;
const inside = (box: BBox, i: TextItem) =>
  i.x >= box.x - EPSILON &&
  i.x + i.w <= box.x + box.w + EPSILON &&
  i.y - i.h >= box.y - EPSILON &&
  i.y <= box.y + box.h + EPSILON;

/**
 * The adapters do not return the items they picked, so they are found again by text in the row's
 * box. Only items within one name height count: every adapter picks a row's items closer than that,
 * and a reference line attached below the row is further away.
 */
function alignmentOf(raw: RawRow, text: PositionedText): AlignmentRow {
  const items = (text.pages[raw.page]?.items ?? []).filter((i) => inside(raw.bbox, i));
  const name = items.find((i) => i.text.trim() === raw.name && Math.abs(i.x - raw.bbox.x) < 1);
  const offset = (field: string): number | null => {
    const wanted = field.trim();
    if (!name || wanted === '') return null;
    const near = items
      .filter((i) => i !== name && i.text.trim() === wanted)
      .map((i) => lineOffset(name, [i]))
      .filter((o) => o <= 1);
    return near.length === 0 ? null : Math.min(...near);
  };
  return {
    page: raw.page,
    name: raw.name,
    value: raw.value,
    aligned: raw.aligned ?? null,
    offsets: {
      value: offset(raw.value),
      unit: offset(raw.unit),
      ref: offset(raw.ref.split('\n')[0] ?? ''),
    },
  };
}

function alignment(text: PositionedText): AlignmentRow[] | null {
  const id = detectAdapter(text).id;
  const raw = id === 'proavis' ? parseProavisRows(text) : id === 'ast' ? parseAstRows(text) : null;
  return raw ? raw.map((row) => alignmentOf(row, text)) : null;
}

const engine = createTesseractEngine();
// No steps here: they are timed below, one variant at a time.
const renderer = createPageRenderer([]);

async function measure(input: MeasureInput): Promise<MeasureOutput> {
  const truth = parseReport(input.truth);
  const rendered = await renderer.fromImages(input.images.map(toFile));
  const preprocessMs: number[] = [];
  const pages: HTMLCanvasElement[] = [];
  for (const { canvas } of rendered) {
    const start = performance.now();
    // preprocessCanvas consumes its input: only the canvas it returns is used.
    pages.push(preprocessCanvas(canvas, input.steps).canvas);
    preprocessMs.push(performance.now() - start);
  }
  const raw = await engine.recognizeRaw(pages);
  for (const page of pages) page.width = page.height = 0;
  return {
    preprocessMs,
    recognizeMs: raw.map((page) => page.ms),
    byRatio: input.ratios.map((ratio) => {
      const text: PositionedText = {
        source: 'ocr',
        pages: raw.map((page) => blocksToPage(page.blocks, page.width, page.height, ratio)),
      };
      return {
        ratio,
        comparison: compareReports(truth, parseReport(text)),
        alignment: alignment(text),
      };
    }),
  };
}

/**
 * What the report states about the pipeline: readingFingerprint() for a reading converted at
 * `ratio` (OCR_TRUST.measuredWith.reading), the app's own ratio and steps, which must match the
 * measured ones before measuredWith is pasted, and isAligned's tolerances.
 */
const settings = (ratio: number) => ({
  reading: readingFingerprint({ ...READING_SETTINGS, wordGapRatio: ratio }),
  appRatio: WORD_GAP_RATIO,
  appPreprocess: PREPROCESS_STEPS.join('+'),
  align: { value: VALUE_ALIGN_TOLERANCE, unit: UNIT_ALIGN_TOLERANCE, ref: REF_ALIGN_TOLERANCE },
});

/** cutRowOutcomes against the fixture itself, for the alignment rows of a saved measure. */
const alignmentOutcomes = (truth: PositionedText, rows: RowResult[], cut: CutRow[]) =>
  cutRowOutcomes(parseReport(truth), rows, cut);

declare global {
  interface Window {
    measure: typeof measure;
    alignmentOutcomes: typeof alignmentOutcomes;
    settings: typeof settings;
    lowestThreshold: typeof lowestThreshold;
  }
}

window.measure = measure;
window.alignmentOutcomes = alignmentOutcomes;
window.settings = settings;
window.lowestThreshold = lowestThreshold;
document.body.dataset.ready = 'true';
