import { buildDraftReport } from './draft';
import { joinText, union } from './layout';
import type { LabAdapter, PositionedPage, PositionedText, RawRow, TextItem } from './types';

/** Every row of the generic adapter needs review: its confidence never exceeds this. */
export const GENERIC_MAX_CONFIDENCE = 0.5;

// name, value, optional unit, optional reference: "Glicemia 87 mg/dl 70 - 110"
const LINE =
  /^(?<name>[A-Za-zÀ-ÿ][^\d<>]*?)\s+(?<value>(?:<=|>=|<|>)?\s*\d[\d.,]*)(?:\s+(?<unit>[^\s\d<>][^\s]*))?(?:\s+(?<ref>.+))?$/;
const DATE = /\b(\d{2})\/(\d{2})\/(\d{4})\b/;
const BIRTH = /nat[oa]\s+il/i;

function lines(page: PositionedPage): TextItem[][] {
  const sorted = [...page.items].sort((a, b) => a.y - b.y || a.x - b.x);
  const result: TextItem[][] = [];
  for (const item of sorted) {
    const current = result[result.length - 1];
    const anchor = current?.[0];
    if (current && anchor && Math.abs(item.y - anchor.y) <= anchor.h * 0.5) current.push(item);
    else result.push([item]);
  }
  return result.map((line) => line.sort((a, b) => a.x - b.x));
}

export function parseGenericRows(pt: PositionedText): RawRow[] {
  const rows: RawRow[] = [];
  pt.pages.forEach((page, pageIndex) => {
    for (const line of lines(page)) {
      const text = line.map((i) => i.text.trim()).join(' ');
      if (DATE.test(text)) continue; // dates are not measurements
      const groups = LINE.exec(text)?.groups;
      if (!groups?.name || !groups.value) continue;
      rows.push({
        name: groups.name.trim(),
        value: groups.value.replace(/\s+/g, ''),
        unit: groups.unit ?? '',
        ref: groups.ref ?? '',
        section: null,
        page: pageIndex,
        bbox: union(line),
      });
    }
  });
  return rows;
}

export function genericDate(pt: PositionedText): string | null {
  for (const page of pt.pages) {
    for (const line of lines(page)) {
      const text = joinText(line);
      if (BIRTH.test(text)) continue;
      const m = DATE.exec(text);
      if (m) return `${m[3]}-${m[2]}-${m[1]}`;
    }
  }
  return null;
}

export const genericAdapter: LabAdapter = {
  id: 'generic',
  labName: null,
  detect: () => 0,
  parse: (pt) =>
    buildDraftReport({
      adapterId: 'generic',
      lab: null,
      sampleDate: genericDate(pt),
      rawRows: parseGenericRows(pt),
      source: pt.source,
      options: { maxConfidence: GENERIC_MAX_CONFIDENCE },
    }),
};
