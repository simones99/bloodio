import type { ReportType, Specimen } from './types';

/** Proposes the report type from the specimens of its rows. The user can change it. */
export function inferReportType(specimens: (Specimen | null)[]): ReportType {
  const blood = specimens.includes('blood');
  const urine = specimens.includes('urine');
  if (blood && urine) return 'misto';
  if (blood) return 'sangue';
  if (urine) return 'urine';
  return 'altro';
}

/** The "urine" filter also shows mixed reports, and so does the "sangue" filter. */
export function reportTypeMatchesFilter(type: ReportType, filter: ReportType): boolean {
  if (type === filter) return true;
  return type === 'misto' && (filter === 'sangue' || filter === 'urine');
}
