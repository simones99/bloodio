import { formatRowValue, type HistoryRow } from '../analyte/analyte-view';
import { formatConvertedNumber, formatDateShort, formatDisplayNumber, it } from '../i18n/it';
import type { ComparisonRow, Delta } from './compare-view';

const MINUS = '−';

const fixedFormats = new Map<number, Intl.NumberFormat>();

function formatFixed(value: number, decimals: number): string {
  let format = fixedFormats.get(decimals);
  if (!format) {
    // Trailing zeros dropped, like the values on the row ("29,20" reads "29,2").
    format = new Intl.NumberFormat('it-IT', { maximumFractionDigits: decimals });
    fixedFormats.set(decimals, format);
  }
  return format.format(value);
}

/**
 * "+12", "+13%" (spec 2026-10-14 §3.5); "invariato" when the difference rounds to zero.
 * With `spoken` the sign is a word ("più 12", "meno 8%"), for screen readers (§4.6).
 */
export function formatDelta(delta: Delta, spoken = false): string[] {
  const size = Math.abs(delta.absolute);
  const zero = delta.decimals === null ? size < 1e-9 : Number(size.toFixed(delta.decimals)) === 0;
  if (zero) return [it.compare.unchanged];
  const text =
    delta.decimals === null ? formatConvertedNumber(size) : formatFixed(size, delta.decimals);
  const negative = delta.absolute < 0;
  const signed = (value: string) =>
    spoken
      ? `${negative ? it.compare.minus : it.compare.plus} ${value}`
      : `${negative ? MINUS : '+'}${value}`;
  const parts = [signed(text)];
  if (delta.percent !== null) {
    const percent = Math.abs(delta.percent);
    parts.push(
      percent < 0.5
        ? spoken
          ? it.compare.underOnePercentSpoken
          : it.compare.underOnePercent
        : signed(`${formatDisplayNumber(Math.round(percent))}%`),
    );
  }
  return parts;
}

export interface Note {
  text: string;
  spoken: string;
  /** Colour of the change of side; null for plain notes. */
  tone: 'out' | 'in' | null;
}

/** The words of a row's meta line: the change of side first, then why something is missing. */
export function rowNotes(row: ComparisonRow): Note[] {
  const notes: Note[] = [];
  const plain = (text: string) => notes.push({ text, spoken: text, tone: null });
  if (row.transition) {
    notes.push({
      text: it.compare.transition[row.transition],
      spoken: it.compare.transitionSpoken[row.transition],
      tone: row.transition === 'now-in' ? 'in' : 'out',
    });
  }
  if (row.kind === 'single') {
    plain(it.compare.onlyIn(formatDateShort((row.newer ?? row.older)!.sampleDate)));
  }
  if (row.kind === 'units') plain(it.compare.differentUnits);
  if (row.limit) plain(it.compare.limit[row.limit]);
  if (row.rangeChanged) plain(it.compare.rangeChanged(row.rangeChanged.from, row.rangeChanged.to));
  return notes;
}

/** "92 mg/dL"; "Assente" without a unit. */
export const valueWithUnit = (row: HistoryRow) =>
  [formatRowValue(row), row.unit].filter(Boolean).join(' ');

/** What a screen reader says for a row: the same facts as the rail, in words. */
export function spokenRow(row: ComparisonRow): string {
  const { older, newer } = row;
  const values =
    older && newer
      ? row.kind === 'units'
        ? it.compare.fromTo(valueWithUnit(older), valueWithUnit(newer))
        : it.compare.fromTo(formatRowValue(older), valueWithUnit(newer))
      : valueWithUnit((newer ?? older)!);
  return [
    row.name,
    values,
    ...rowNotes(row).map((note) => note.spoken),
    ...(row.delta ? formatDelta(row.delta, true) : []),
  ].join(', ');
}
