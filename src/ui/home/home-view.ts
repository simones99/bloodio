import { limitDistance, type WatchSide } from '../../domain/trend';
import { analyteRefToString, type CustomAnalyte, type UnitSystem } from '../../domain/types';
import type { AnalyteLatest, ReportSummary } from '../../storage/types';
import { analytePath, buildAnalyteView, type HistoryRow } from '../analyte/analyte-view';
import { localDay } from '../app/backup-state';

/** How far back the "Da referti precedenti" block reaches. */
export const OLDER_MONTHS = 12;
/** How many reports the "Ultimi referti" section shows. */
export const RECENT_REPORTS = 3;

export interface HomeItem {
  key: string;
  name: string;
  path: string;
  /** The latest value, in the display unit when convertible, otherwise as printed. */
  row: HistoryRow;
  watch: WatchSide | null;
  /** Distance from the nearest printed limit (see limitDistance); null when not measurable. */
  distance: number | null;
}

export interface HomeList {
  /** Entries whose latest value is from the latest report's date. */
  current: HomeItem[];
  /** Entries missing from the latest report, sampled within the last OLDER_MONTHS. */
  older: HomeItem[];
  /** Entries missing from the latest report and sampled before that: counted, not listed. */
  olderHidden: number;
}

export interface HomeView {
  /** The latest report, for the slab; null without reports. */
  latest: ReportSummary | null;
  outOfRange: HomeList;
  watch: HomeList;
  recent: ReportSummary[];
}

export interface HomeInput {
  entries: AnalyteLatest[];
  /** Newest first, as listReportSummaries returns them. */
  summaries: ReportSummary[];
  custom: CustomAnalyte[];
  preferredUnits: Record<string, string>;
  system: UnitSystem;
  today: Date;
}

/**
 * The first day still inside the older block: the same calendar day OLDER_MONTHS earlier.
 * On 29 February the previous year has no such day and the cutoff rolls to 1 March.
 */
export function olderCutoff(today: Date): string {
  return localDay(new Date(today.getFullYear(), today.getMonth() - OLDER_MONTHS, today.getDate()));
}

function distanceOf(row: HistoryRow): number | null {
  if (row.value === null || row.comparator !== null || !row.converted) return null;
  return limitDistance(row.value, row.refMin, row.refMax);
}

type Order = 'farthest' | 'closest';

/** By distance in the given direction; entries without a distance last; then by name. */
function byDistance(order: Order) {
  return (a: HomeItem, b: HomeItem): number => {
    if (a.distance !== null && b.distance !== null && a.distance !== b.distance) {
      return order === 'farthest' ? b.distance - a.distance : a.distance - b.distance;
    }
    if (a.distance === null && b.distance !== null) return 1;
    if (a.distance !== null && b.distance === null) return -1;
    return a.name.localeCompare(b.name, 'it');
  };
}

function split(
  items: HomeItem[],
  latestDate: string | null,
  cutoff: string,
  order: Order,
): HomeList {
  const compare = byDistance(order);
  const current = items.filter((i) => i.row.sampleDate === latestDate);
  const rest = items.filter((i) => i.row.sampleDate !== latestDate);
  const older = rest.filter((i) => i.row.sampleDate >= cutoff);
  return {
    current: current.sort(compare),
    older: older.sort(compare),
    olderHidden: rest.length - older.length,
  };
}

/**
 * The Home: the latest report, the entries whose latest value is out of range or close to a
 * limit, and the most recent reports. Each entry goes through the entry page's view on its
 * latest two values, exactly as in the values list, so Home and Valori never disagree.
 */
export function buildHome(input: HomeInput): HomeView {
  const latest = input.summaries[0] ?? null;
  const items = input.entries.flatMap((entry): HomeItem[] => {
    const key = analyteRefToString(entry.ref);
    const points = entry.previous ? [entry.previous, entry.latest] : [entry.latest];
    const view = buildAnalyteView(
      points,
      entry.ref,
      input.custom,
      input.preferredUnits[key],
      input.system,
    );
    if (!view.latest) return [];
    return [
      {
        key,
        name: view.name,
        path: analytePath(entry.ref),
        row: view.latest,
        watch: view.watch,
        distance: distanceOf(view.latest),
      },
    ];
  });

  const latestDate = latest?.report.sampleDate ?? null;
  const cutoff = olderCutoff(input.today);
  return {
    latest,
    outOfRange: split(
      items.filter((i) => i.row.outOfRange === true),
      latestDate,
      cutoff,
      'farthest',
    ),
    watch: split(
      items.filter((i) => i.watch !== null),
      latestDate,
      cutoff,
      'closest',
    ),
    recent: input.summaries.slice(0, RECENT_REPORTS),
  };
}
