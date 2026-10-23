import type { Comparator, ReportType } from '../domain/types';

/** One run of text with its position. x is the left edge, y the baseline, both growing right/down. */
export interface TextItem {
  text: string;
  x: number;
  y: number;
  w: number;
  h: number;
  /** OCR word confidence 0..1. Absent for text extracted from a PDF text layer. */
  confidence?: number;
}

export interface PositionedPage {
  width: number;
  height: number;
  items: TextItem[];
}

/** The single intermediate format every import channel produces. */
export interface PositionedText {
  source: 'pdf-text' | 'ocr';
  pages: PositionedPage[];
}

export interface BBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** A table row as printed, before any domain interpretation. */
export interface RawRow {
  name: string;
  value: string;
  unit: string;
  /** Reference text; continuation lines are joined with "\n". */
  ref: string;
  section: string | null;
  /** Zero-based page index. */
  page: number;
  bbox: BBox;
  /**
   * Set by the adapters that pick a row's value by position: true when the value and the unit sit
   * on the name's line (isAligned in layout.ts). An OCR row that is not aligned is never trusted: beyond
   * spec 2026-10-16 §6.2, recorded in Task 17. Absent means unknown, so never trusted either.
   */
  aligned?: boolean;
}

export type RowFlag =
  | 'ambiguous-number'
  | 'age-stratified-ref'
  | 'derived-ref'
  | 'unit-mismatch'
  /** OCR mangled the unit and it was repaired by shape (spec 2026-10-16 §5): always reviewed. */
  | 'ocr-unit'
  | 'ambiguous-analyte'
  | 'suggested-analyte'
  | 'unknown-analyte'
  | 'low-ocr';

/** A row ready for the verification screen: printed text, interpretation, and how much to trust it. */
export interface DraftRow {
  rawName: string;
  rawValue: string;
  rawUnit: string;
  rawRef: string;
  section: string | null;
  page: number;
  bbox: BBox;
  analyteMatch: { analyteId: string | null; suggestionId: string | null; score: number };
  parsed: {
    value: number | null;
    comparator: Comparator | null;
    valueText: string;
    unit: string | null;
    refMin: number | null;
    refMax: number | null;
    refText: string | null;
  };
  /** 0..1. Below REVIEW_THRESHOLD, or with any flag, the row must be reviewed by the user. */
  confidence: number;
  flags: RowFlag[];
  /**
   * Rows read by OCR only: the lowest word confidence in the row's box (null without words there),
   * and whether conditions 2–6 of spec 2026-10-16 §6.2 hold with the row's box overlapping no
   * other row's (overlappingRows). The measuring tool reads both.
   */
  ocr?: { confidence: number | null; trustable: boolean };
}

export interface DraftReport {
  adapterId: string;
  lab: string | null;
  /** ISO date yyyy-mm-dd, or null when not found. */
  sampleDate: string | null;
  type: ReportType;
  rows: DraftRow[];
  warnings: string[];
}

export interface LabAdapter {
  id: string;
  labName: string | null;
  /** 0..1: how sure the adapter is that this document comes from its lab. */
  detect(pt: PositionedText): number;
  parse(pt: PositionedText): DraftReport;
}
