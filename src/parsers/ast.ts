import { buildDraftReport } from './draft';
import { keepEmptyValueAsRow } from './headings';
import type { LabAdapter, PositionedPage, PositionedText, RawRow, TextItem } from './types';
import { allText, findItem, itemsNear, joinText, union } from './layout';

const H_NAME = /^Esame$/i;
const H_VALUE = /^Esito$/i;
const H_UNIT = /^U\.?M\.?$/i;
const H_REF = /^Val\.? riferimento$/i;
const STOP = /^(La plausibilita|Le firme autografe|Pagina\b)/i;

export function detectAst(pt: PositionedText): number {
  const page = pt.pages[0];
  if (!page) return 0;
  let score = 0;
  if (
    findItem(page, H_NAME) &&
    findItem(page, H_VALUE) &&
    findItem(page, H_UNIT) &&
    findItem(page, H_REF)
  )
    score += 0.7;
  if (/Azienda Sanitaria Territoriale/i.test(allText(page))) score += 0.3;
  return Math.min(1, score);
}

export function astDate(pt: PositionedText): string | null {
  for (const page of pt.pages) {
    const label = findItem(page, /^Check-in:?$/i);
    if (!label) continue;
    const candidates = itemsNear(page.items, label, -0.5, 0.5);
    for (const i of candidates) {
      if (/nat[oa]\s+il/i.test(i.text)) continue;
      const m = /(\d{2})\/(\d{2})\/(\d{4})/.exec(i.text);
      if (m) return `${m[3]}-${m[2]}-${m[1]}`;
    }
  }
  return null;
}

type Column = 'name' | 'value' | 'unit' | 'ref';

function parsePage(
  page: PositionedPage,
  pageIndex: number,
  startSection: string | null,
): { rows: RawRow[]; section: string | null } {
  const hn = findItem(page, H_NAME),
    hv = findItem(page, H_VALUE),
    hu = findItem(page, H_UNIT),
    hr = findItem(page, H_REF);
  if (!hn || !hv || !hu || !hr) return { rows: [], section: startSection };
  const stop =
    page.items
      .filter((i) => STOP.test(i.text.trim()))
      .map((i) => i.y)
      .sort((a, b) => a - b)[0] ?? page.height;
  const body = page.items.filter((i) => i.y > hn.y + hn.h * 0.5 && i.y < stop - 1);
  const slack = page.width * 0.02;
  const columnOf = (i: TextItem): Column =>
    i.x < hv.x - slack
      ? 'name'
      : i.x < hu.x - slack
        ? 'value'
        : i.x < hr.x - slack
          ? 'unit'
          : 'ref';

  const names = body.filter((i) => columnOf(i) === 'name').sort((a, b) => a.y - b.y);
  const others = body.filter((i) => columnOf(i) !== 'name');
  const used = new Set<TextItem>();
  const rows: RawRow[] = [];
  let section = startSection;
  for (const name of names) {
    const near = itemsNear(others, name, -0.4, 0.4);
    const pick = (col: Column) => near.filter((i) => columnOf(i) === col);
    if (pick('value').length === 0) {
      const hasNearbyRefOrUnit = pick('ref').length > 0 || pick('unit').length > 0;
      if (!hasNearbyRefOrUnit || !keepEmptyValueAsRow(name.text.trim(), section)) {
        section = name.text.trim();
        continue;
      }
      const parts = [name, ...pick('unit'), ...pick('ref')];
      parts.forEach((i) => used.add(i));
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
    const parts = [name, ...near];
    parts.forEach((i) => used.add(i));
    rows.push({
      name: name.text.trim(),
      value: joinText(pick('value')),
      unit: joinText(pick('unit')),
      ref: joinText(pick('ref')),
      section,
      page: pageIndex,
      bbox: union(parts),
    });
  }
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

export function parseAstRows(pt: PositionedText): RawRow[] {
  const rows: RawRow[] = [];
  let section: string | null = null;
  pt.pages.forEach((page, idx) => {
    const r = parsePage(page, idx, section);
    rows.push(...r.rows);
    section = r.section;
  });
  return rows;
}

const AST_HEADER = /Azienda Sanitaria Territoriale\s*[-–]\s*(\S.*)$/i;

function titleCase(text: string): string {
  return text
    .toLowerCase()
    .replace(/(^|[\s'-])(\p{L})/gu, (_, sep: string, ch: string) => sep + ch.toUpperCase());
}

/** Lab name from the letterhead: "Azienda Sanitaria Territoriale - ANCONA" becomes "AST Ancona". */
export function astLabName(pt: PositionedText): string {
  for (const page of pt.pages) {
    for (const item of page.items) {
      const m = AST_HEADER.exec(item.text.trim());
      const town = m?.[1]?.trim();
      if (town) return `AST ${titleCase(town)}`;
    }
  }
  return 'AST';
}

export const astAdapter: LabAdapter = {
  id: 'ast',
  labName: 'AST',
  detect: detectAst,
  parse: (pt) =>
    buildDraftReport({
      adapterId: 'ast',
      lab: astLabName(pt),
      sampleDate: astDate(pt),
      rawRows: parseAstRows(pt),
      source: pt.source,
    }),
};
