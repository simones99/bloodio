import type { AnalyteRef, CustomAnalyte, Measurement, Report, ReportType } from '../domain/types';
import type { Listener } from './events';

/** What the caller provides; ids, timestamps and profile are assigned by the repository. */
export type ReportInput = Pick<
  Report,
  'sampleDate' | 'lab' | 'type' | 'source' | 'adapterId' | 'notes' | 'fileHash'
>;

/** outOfRange is always recomputed by the repository, so it is never stale. */
export type MeasurementInput = Omit<Measurement, 'id' | 'reportId' | 'outOfRange' | 'order'> & {
  /** Set only when updating an existing measurement, to keep its id stable across the edit. */
  id?: string;
};

export interface AttachmentInput {
  data: ArrayBuffer;
  mimeType: string;
  fileName: string;
}

export interface ReportWithMeasurements {
  report: Report;
  measurements: Measurement[];
}

/** A report with the counts a list needs, so lists never load every measurement. */
export interface ReportSummary {
  report: Report;
  total: number;
  outOfRange: number;
}

export interface ReportFilter {
  type?: ReportType;
  lab?: string;
  /** Inclusive ISO dates. */
  from?: string;
  to?: string;
}

export interface SeriesPoint {
  measurement: Measurement;
  reportId: string;
  sampleDate: string;
  lab: string;
}

/** The most recent measurements of one entry (catalog or custom analyte), for lists. */
export interface AnalyteLatest {
  ref: AnalyteRef;
  /** Most recent by sample date; ties keep the same stable order as listSeries. */
  latest: SeriesPoint;
  /** The measurement just before `latest`, or null when there is only one. */
  previous: SeriesPoint | null;
  /** How many measurements this entry has. */
  count: number;
}

export interface LatestReference {
  unit: string | null;
  refMin: number | null;
  refMax: number | null;
  refText: string | null;
  sampleDate: string;
}

export interface DuplicateQuery {
  fileHash?: string | null;
  sampleDate?: string;
  lab?: string;
}

export interface ReportRepository {
  saveReport(
    report: ReportInput,
    measurements: MeasurementInput[],
    attachments?: AttachmentInput[],
  ): Promise<string>;
  updateReport(id: string, report: ReportInput, measurements: MeasurementInput[]): Promise<void>;
  deleteReport(id: string): Promise<void>;
  getReport(id: string): Promise<ReportWithMeasurements | undefined>;
  /** Newest first. */
  listReports(filter?: ReportFilter): Promise<Report[]>;
  /** Newest first, with value counts. */
  listReportSummaries(filter?: ReportFilter): Promise<ReportSummary[]>;
  /** Oldest first. */
  listSeries(ref: AnalyteRef): Promise<SeriesPoint[]>;
  /** Every entry with at least one measurement, with its latest two. One read of all data. */
  listLatestPerAnalyte(): Promise<AnalyteLatest[]>;
  latestReferenceFor(ref: AnalyteRef): Promise<LatestReference | undefined>;
  findDuplicates(query: DuplicateQuery): Promise<Report[]>;
  listLabs(): Promise<string[]>;
  subscribe(listener: Listener): () => void;
}

export type CustomAnalyteInput = Omit<CustomAnalyte, 'id'>;

export interface CustomAnalyteStore {
  list(): Promise<CustomAnalyte[]>;
  create(input: CustomAnalyteInput): Promise<CustomAnalyte>;
  rename(id: string, name: string): Promise<void>;
  /** Refuses to remove an analyte that still has measurements. */
  remove(id: string): Promise<void>;
}

export interface Settings {
  language: 'it';
  theme: 'nero' | 'carta' | 'auto';
  unitSystem: 'conventional' | 'si';
  /** analyte ref string -> preferred display unit */
  preferredUnits: Record<string, string>;
  keepOriginalFile: boolean;
  disclaimerAcceptedAt: string | null;
  lastExportAt: string | null;
  dataChangedAt: string | null;
}

export interface SettingsStore {
  get<K extends keyof Settings>(key: K): Promise<Settings[K]>;
  set<K extends keyof Settings>(key: K, value: Settings[K]): Promise<void>;
  subscribe(listener: Listener): () => void;
}

export function normalizeLab(lab: string): string {
  return lab.trim().toLowerCase().replace(/\s+/g, ' ');
}
