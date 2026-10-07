import { buildDraftReport } from './draft';
import { keepEmptyValueAsRow } from './headings';
import type { LabAdapter, PositionedPage, PositionedText, RawRow, TextItem } from './types';
import { allText, center, findItem, itemsNear, joinText, union } from './layout';

const REF_HEADER = /^Valori di riferimento$/i;
const UNIT_HEADER = /^U\.?M\.?$/i;
const METHOD_HEADER = /^Metodica$/i;
const FOOTER = /^(Il Direttore|Dott\.|Pagina \d+ di \d+|Referto firmato)/i;
const NOISE = /^[.-]$/;
// Place and date of the report, e.g. "Ancona, 04/10/2021". Any place name is accepted.
const PLACE_DATE = /\p{Lu}[\p{L}' ]*,\s*(\d{2})\/(\d{2})\/(\d{4})/u;

export function detectProavis(pt: PositionedText): number {
  const page = pt.pages[0];
  if (!page) return 0;
  const text = allText(page);
  let score = 0;
  if (findItem(page, REF_HEADER) && findItem(page, UNIT_HEADER) && findItem(page, METHOD_HEADER))
    score += 0.7;
  if (/PROAVIS/i.test(text)) score += 0.3;
  if (PLACE_DATE.test(text)) score += 0.2;
  return Math.min(1, score);
}

export function proavisDate(pt: PositionedText): string | null {
  for (const page of pt.pages) {
    const m = PLACE_DATE.exec(allText(page));
    if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  }
  return null;
}

type Column = 'name' | 'value' | 'ref' | 'unit' | 'method';

function parsePage(
  page: PositionedPage,
  pageIndex: number,
  startSection: string | null,
): { rows: RawRow[]; section: string | null } {
  const refH = findItem(page, REF_HEADER);
  const unitH = findItem(page, UNIT_HEADER);
  const methodH = findItem(page, METHOD_HEADER);
  if (!refH || !unitH || !methodH) return { rows: [], section: startSection };

  const body = page.items.filter((i) => i.y > refH.y + refH.h * 0.5 && !FOOTER.test(i.text.trim()));
  const refLeft = refH.x - refH.w * 0.25;
  // Value column: most common left edge among number-like items left of the reference column.
  const counts = new Map<number, number>();
  for (const i of body)
    if (i.x < refLeft && /^[<>]?\s*\d/.test(i.text))
      counts.set(Math.round(i.x), (counts.get(Math.round(i.x)) ?? 0) + 1);
  const valueX = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? refLeft * 0.55;
  const nameRight = valueX - page.width * 0.015;

  const columnOf = (i: TextItem): Column => {
    if (i.x < nameRight) return 'name';
    if (i.x < refLeft) return 'value';
    // Reference, unit and method are centred under their headings: pick the closest heading.
    const c = center(i);
    const toRef = Math.abs(c - center(refH));
    const toUnit = Math.abs(c - center(unitH));
    const toMethod = Math.abs(c - center(methodH));
    if (toRef <= toUnit && toRef <= toMethod) return 'ref';
    return toUnit <= toMethod ? 'unit' : 'method';
  };

  const names = body.filter((i) => columnOf(i) === 'name').sort((a, b) => a.y - b.y);
  const others = body.filter((i) => columnOf(i) !== 'name' && !NOISE.test(i.text.trim()));
  const used = new Set<TextItem>();
  const rows: RawRow[] = [];
  let section = startSection;

  for (const name of names) {
    const near = itemsNear(others, name, -0.85, 0.35);
    const pick = (col: Column) => near.filter((i) => columnOf(i) === col);
    const value = pick('value');
    if (value.length === 0) {
      // A true section title has no reference or unit column nearby either; only a mis-columned
      // catalog row (its ref/unit still readable) should be kept as a row to review.
      const hasNearbyRefOrUnit = pick('ref').length > 0 || pick('unit').length > 0;
      if (!hasNearbyRefOrUnit || !keepEmptyValueAsRow(name.text.trim(), section)) {
        // A name without a value is a section heading ("EMATOLOGIA", "FORMULA LEUCOCITARIA .").
        section = name.text.trim();
        continue;
      }
      // A catalog analyte with a mis-columned value: keep it as a row to review.
      const parts = [name, ...pick('ref'), ...pick('unit')];
      parts.forEach((i) => used.add(i));
      pick('method').forEach((i) => used.add(i));
      rows.push({
        name: name.text.trim(),
        value: '',
        unit: joinText(pick('unit')),
        ref: joinText(pick('ref')),
        section,
        page: pageIndex,
        bbox: union(parts),
      });
      continue;
    }
    const parts = [name, ...value, ...pick('ref'), ...pick('unit')];
    parts.forEach((i) => used.add(i));
    pick('method').forEach((i) => used.add(i));
    rows.push({
      name: name.text.trim(),
      value: joinText(value),
      unit: joinText(pick('unit')),
      ref: joinText(pick('ref')),
      section,
      page: pageIndex,
      bbox: union(parts),
    });
  }

  // Reference text continuing on following lines (e.g. Vitamina D bands): attach to the closest row above.
  const orphans = others
    .filter((i) => !used.has(i) && columnOf(i) === 'ref')
    .sort((a, b) => a.y - b.y);
  for (const o of orphans) {
    const owner = [...rows]
      .reverse()
      .find(
        (r) =>
          r.page === pageIndex &&
          r.bbox.y + r.bbox.h <= o.y &&
          o.y - (r.bbox.y + r.bbox.h) < o.h * 3,
      );
    if (owner) {
      owner.ref = owner.ref ? `${owner.ref}\n${o.text.trim()}` : o.text.trim();
      owner.bbox = { ...owner.bbox, h: o.y - owner.bbox.y };
    }
  }
  return { rows, section };
}

export function parseProavisRows(pt: PositionedText): RawRow[] {
  const rows: RawRow[] = [];
  let section: string | null = null;
  pt.pages.forEach((page, idx) => {
    const r = parsePage(page, idx, section);
    rows.push(...r.rows);
    section = r.section;
  });
  return rows;
}

export const proavisAdapter: LabAdapter = {
  id: 'proavis',
  labName: 'PROAVIS',
  detect: detectProavis,
  parse: (pt) =>
    buildDraftReport({
      adapterId: 'proavis',
      lab: 'PROAVIS',
      sampleDate: proavisDate(pt),
      rawRows: parseProavisRows(pt),
      source: pt.source,
    }),
};
