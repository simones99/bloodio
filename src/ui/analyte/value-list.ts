import { getAnalyte } from '../../domain/catalog';
import { analyteRefToString, type Category, type CustomAnalyte } from '../../domain/types';
import type { AnalyteLatest } from '../../storage/types';
import { it } from '../i18n/it';
import { analytePath, buildAnalyteView, type HistoryRow } from './analyte-view';
import { searchByName } from './search';

export interface ValueListItem {
  key: string;
  name: string;
  path: string;
  /** The latest value, in the preferred unit when convertible, otherwise as printed. */
  row: HistoryRow;
  watch: boolean;
}

export interface ValueGroup {
  category: Category;
  items: ValueListItem[];
}

const CATEGORY_ORDER = Object.keys(it.category) as Category[];

/**
 * The values list: one item per entry with data, grouped by category in a fixed order and sorted
 * by name, filtered by the search query. Each item reuses the analyte page's view on the latest
 * two measurements, so the list and the page agree on value and unit. "Watch" uses only the latest
 * two values and is off when the previous one has a comparator or another unit (spec section 4),
 * so it can differ from the entry page in that case.
 */
export function buildValueList(
  entries: AnalyteLatest[],
  custom: CustomAnalyte[],
  preferredUnits: Record<string, string>,
  query: string,
): ValueGroup[] {
  const candidates = entries.flatMap((entry) => {
    const key = analyteRefToString(entry.ref);
    const points = entry.previous ? [entry.previous, entry.latest] : [entry.latest];
    const view = buildAnalyteView(points, entry.ref, custom, preferredUnits[key]);
    if (!view.latest) return [];
    const aliases = entry.ref.kind === 'catalog' ? (getAnalyte(entry.ref.id)?.aliases ?? []) : [];
    return [
      {
        category: view.category,
        names: [view.name, ...aliases],
        item: {
          key,
          name: view.name,
          path: analytePath(entry.ref),
          row: view.latest,
          watch: view.watch,
        },
      },
    ];
  });

  const found = searchByName(candidates, query, (c) => c.names);
  return CATEGORY_ORDER.map((category) => ({
    category,
    items: found
      .filter((c) => c.category === category)
      .map((c) => c.item)
      .sort((a, b) => a.name.localeCompare(b.name, 'it')),
  })).filter((group) => group.items.length > 0);
}
