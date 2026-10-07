import { normalizeName } from '../../domain/normalize';

/**
 * Items whose names start with the query first, then those that merely contain it. Case, accents
 * and punctuation do not matter. An empty query returns every item, in the given order.
 */
export function searchByName<T>(items: T[], query: string, names: (item: T) => string[]): T[] {
  const needle = normalizeName(query);
  if (needle === '') return items;
  const candidates = items.map((item) => ({ item, names: names(item).map(normalizeName) }));
  const starts = candidates.filter((c) => c.names.some((n) => n.startsWith(needle)));
  const contains = candidates.filter(
    (c) => !starts.includes(c) && c.names.some((n) => n.includes(needle)),
  );
  return [...starts, ...contains].map((c) => c.item);
}
