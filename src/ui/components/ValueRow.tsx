import { Link } from 'react-router';
import { formatRowValue, hasReference, type HistoryRow } from '../analyte/analyte-view';
import { formatDateShort } from '../i18n/it';
import { Rail } from './Rail';
import { RangeFlag } from './RangeFlag';
import styles from './ValueRow.module.css';

interface ValueRowProps {
  name: string;
  path: string;
  /** The latest value, in the display unit when convertible, otherwise as printed. */
  row: HistoryRow;
  /** Close to a limit and moving towards it: the rail marks it. */
  watch: boolean;
  /** False where every row shares the same date (the latest report on the Home). */
  showDate?: boolean;
  /** Words for "da tenere d’occhio", next to the range flag. */
  watchLabel?: string;
}

/** One entry with its latest value, as a link to the entry's page. Used by Valori and Home. */
export function ValueRow({ name, path, row, watch, showDate = true, watchLabel }: ValueRowProps) {
  return (
    <Link to={path} className={styles.row}>
      <span className={styles.name}>{name}</span>
      <span className={styles.value}>
        {formatRowValue(row)}
        {row.value !== null && row.unit && (
          <>
            {' '}
            <small>{row.unit}</small>
          </>
        )}
      </span>
      {row.value !== null && (
        <div className={styles.rail}>
          <Rail
            value={row.value}
            refMin={row.refMin}
            refMax={row.refMax}
            comparator={row.comparator}
            watch={watch}
          />
        </div>
      )}
      <div className={styles.meta}>
        <RangeFlag
          outOfRange={row.outOfRange}
          value={row.value}
          refMin={row.refMin}
          refMax={row.refMax}
          hasReference={hasReference(row)}
        />
        {watchLabel && <span className={styles.watch}>{watchLabel}</span>}
        {showDate && <span className={styles.date}>{formatDateShort(row.sampleDate)}</span>}
      </div>
    </Link>
  );
}
