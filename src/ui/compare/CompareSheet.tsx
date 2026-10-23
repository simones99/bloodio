import { useEffect, useState, type KeyboardEvent } from 'react';
import type { Report } from '../../domain/types';
import { useModalFocus } from '../app/use-modal-focus';
import { formatDateLong, it } from '../i18n/it';
import shared from '../styles/shared.module.css';
import { compareChronologically, previousComparable, sharedCount } from './previous';
import styles from './CompareSheet.module.css';

interface CompareSheetProps {
  /** The report that stays in the comparison. */
  fixed: Report;
  /** Every report, newest first. */
  reports: Report[];
  refs: Map<string, Set<string>>;
  /** The other report of the comparison on screen, if any. */
  selected: string | null;
  onChoose(id: string): void;
  onClose(): void;
}

/** The radio group's tab stop: the checked radio, or the first one when none is checked. */
function groupStop(container: HTMLElement | null): HTMLInputElement | undefined {
  const radios = [...(container?.querySelectorAll<HTMLInputElement>('input[type="radio"]') ?? [])];
  return radios.find((r) => r.checked) ?? radios[0];
}

function enabledButtons(container: HTMLElement | null): HTMLButtonElement[] {
  return [...(container?.querySelectorAll<HTMLButtonElement>('button:not([disabled])') ?? [])];
}

/** Bottom sheet to pick the report `fixed` is compared with (spec 2026-10-14 §4.4). */
export function CompareSheet({
  fixed,
  reports,
  refs,
  selected,
  onChoose,
  onClose,
}: CompareSheetProps) {
  // Newest first; on the same day the report added last comes first.
  const others = reports
    .filter((r) => r.id !== fixed.id)
    .sort((x, y) => compareChronologically(y, x));
  // Only a report in the list can start chosen: the fixed one or a deleted id would leave
  // "Confronta" enabled with no radio checked.
  const [choice, setChoice] = useState(() =>
    others.some((r) => r.id === selected) ? selected : null,
  );
  const { ref: sheet, onKeyDown } = useModalFocus<HTMLDivElement>(onClose);
  const previous = previousComparable(fixed, reports, refs);

  // Runs after useModalFocus's effect has captured the opener, so closing returns focus there.
  useEffect(() => {
    (groupStop(sheet.current) ?? enabledButtons(sheet.current)[0])?.focus();
  }, [sheet]);

  // The trap wraps between the first and last focusable items, but the radio group's tab stop
  // is the checked radio, not necessarily the first: wrap Shift+Tab from any radio to the last
  // button, and Tab from the last button back to the group's stop.
  function handleKeyDown(event: KeyboardEvent) {
    if (event.key === 'Tab') {
      const last = enabledButtons(sheet.current).at(-1);
      const target =
        event.shiftKey && event.target instanceof HTMLInputElement
          ? last
          : !event.shiftKey && event.target === last
            ? groupStop(sheet.current)
            : undefined;
      if (target) {
        event.preventDefault();
        target.focus();
        return;
      }
    }
    onKeyDown(event);
  }

  return (
    <div className={styles.backdrop}>
      <div
        ref={sheet}
        className={styles.sheet}
        role="dialog"
        aria-modal="true"
        aria-labelledby="compare-sheet-title"
        onKeyDown={handleKeyDown}
      >
        <h2 id="compare-sheet-title" className={styles.title}>
          {it.compare.sheetTitle(formatDateLong(fixed.sampleDate))}
        </h2>
        <div role="radiogroup" aria-labelledby="compare-sheet-title" className={styles.list}>
          {others.map((report) => (
            <label key={report.id} className={styles.option}>
              <input
                type="radio"
                name="compare-with"
                value={report.id}
                checked={choice === report.id}
                onChange={() => setChoice(report.id)}
              />
              <span className={styles.text}>
                <span className={styles.date}>{formatDateLong(report.sampleDate)}</span>
                <span className={styles.detail}>
                  {[
                    report.lab,
                    it.compare.inCommon(sharedCount(refs.get(fixed.id), refs.get(report.id))),
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </span>
              </span>
              {report.id === previous?.id && (
                <span className={styles.chip}>{it.compare.previous}</span>
              )}
            </label>
          ))}
        </div>
        <div className={styles.actions}>
          <button type="button" className={shared.secondary} onClick={onClose}>
            {it.compare.cancel}
          </button>
          <button
            type="button"
            className={shared.primary}
            disabled={choice === null}
            onClick={() => choice !== null && onChoose(choice)}
          >
            {it.compare.confirm}
          </button>
        </div>
      </div>
    </div>
  );
}
