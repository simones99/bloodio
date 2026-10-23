import { Link } from 'react-router';
import { formatRowValue } from '../analyte/analyte-view';
import { Rail } from '../components/Rail';
import { formatDelta, rowNotes, spokenRow, valueWithUnit } from './compare-text';
import type { ComparisonRow } from './compare-view';
import styles from './CompareRow.module.css';

/** One entry of a comparison: older → recent on one rail, the notes and the difference. */
export function CompareRow({ row }: { row: ComparisonRow }) {
  const { older, newer } = row;
  const current = (newer ?? older)!;
  const onRail = (row.kind === 'numeric' || row.kind === 'single') && current.value !== null;
  return (
    <div className={styles.row}>
      <Link to={row.path} className={styles.name}>
        {row.name}
      </Link>
      <span className="visually-hidden">{spokenRow(row)}</span>
      <span className={styles.value} aria-hidden="true">
        {older && newer ? (
          <>
            <span className={styles.old}>
              {row.kind === 'units' ? valueWithUnit(older) : formatRowValue(older)}
            </span>
            {/* a no-break space: a long value wraps before the arrow, never after it */}
            {' →\u00a0'}
            {formatRowValue(newer)}
          </>
        ) : (
          <span className={newer ? undefined : styles.old}>{formatRowValue(current)}</span>
        )}
        {current.unit && <small>{current.unit}</small>}
      </span>
      {onRail && (
        <div className={styles.rail}>
          <Rail
            value={newer?.value ?? null}
            from={older?.value ?? null}
            refMin={current.refMin}
            refMax={current.refMax}
            comparator={newer?.comparator ?? null}
          />
        </div>
      )}
      <div className={styles.meta} aria-hidden="true">
        <span className={styles.notes}>
          {rowNotes(row).map((note) => (
            <span key={note.text} data-tone={note.tone ?? undefined}>
              {note.text}
            </span>
          ))}
        </span>
        {row.delta && <span className={styles.delta}>{formatDelta(row.delta).join(' · ')}</span>}
      </div>
    </div>
  );
}
