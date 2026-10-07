export type Specimen = 'blood' | 'urine';
export type AnalyteKind = 'numeric' | 'qualitative';

export type Category =
  | 'ematologia'
  | 'lipidi'
  | 'renale'
  | 'epatica'
  | 'tiroide'
  | 'glicemia'
  | 'elettroliti'
  | 'ferro'
  | 'vitamine'
  | 'ormoni'
  | 'infiammazione'
  | 'coagulazione'
  | 'proteine'
  | 'urine'
  | 'altro';

/** value_in_unit × toCanonical = value_in_canonical_unit */
export interface UnitFactor {
  unit: string;
  toCanonical: number;
}

export interface PlausibleRange {
  min: number;
  max: number;
}

export interface Analyte {
  id: string;
  /** Italian display name. */
  name: string;
  /** Names as printed on reports. Matching normalizes them, so write them naturally. */
  aliases: string[];
  category: Category;
  specimen: Specimen;
  kind: AnalyteKind;
  /** Normalized spelling (see normalizeUnit). Absent for unitless analytes such as pH. */
  canonicalUnit?: string;
  /** Other units this analyte can be printed in, excluding the canonical one. */
  units?: UnitFactor[];
  /** Physically plausible values in canonical unit. Used only to disambiguate "1.029" vs "1029". */
  plausible?: PlausibleRange;
}

export type Comparator = '<' | '>' | '<=' | '>=';
export type ReportType = 'sangue' | 'urine' | 'misto' | 'altro';
export type ReportSource = 'parser' | 'ocr' | 'manuale';
/** null = cannot be evaluated ("non valutabile"). Never treat null as in range. */
export type OutOfRange = boolean | null;

export interface Report {
  id: string;
  profileId: string;
  /** ISO date, yyyy-mm-dd. */
  sampleDate: string;
  lab: string;
  type: ReportType;
  source: ReportSource;
  adapterId: string | null;
  notes: string;
  fileHash: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Measurement {
  id: string;
  reportId: string;
  /** Exactly one of analyteId / customAnalyteId is set. */
  analyteId: string | null;
  customAnalyteId: string | null;
  value: number | null;
  comparator: Comparator | null;
  /** Value exactly as printed ("<10", "Assente", "13,8"). */
  valueText: string;
  /** Unit as printed, normalized spelling. */
  unit: string | null;
  refMin: number | null;
  refMax: number | null;
  refText: string | null;
  outOfRange: OutOfRange;
  confidence: number;
  section: string | null;
  order: number;
}

export interface CustomAnalyte {
  id: string;
  name: string;
  unit: string | null;
  category: Category;
  specimen: Specimen;
  kind: AnalyteKind;
}

export type AnalyteRef = { kind: 'catalog'; id: string } | { kind: 'custom'; id: string };

export function analyteRefOf(
  m: Pick<Measurement, 'analyteId' | 'customAnalyteId'>,
): AnalyteRef | null {
  if (m.analyteId) return { kind: 'catalog', id: m.analyteId };
  if (m.customAnalyteId) return { kind: 'custom', id: m.customAnalyteId };
  return null;
}

export function analyteRefToString(ref: AnalyteRef): string {
  return ref.kind === 'catalog' ? ref.id : `custom:${ref.id}`;
}

export function parseAnalyteRef(text: string): AnalyteRef {
  return text.startsWith('custom:')
    ? { kind: 'custom', id: text.slice('custom:'.length) }
    : { kind: 'catalog', id: text };
}
