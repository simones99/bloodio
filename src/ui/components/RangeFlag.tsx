import type { OutOfRange } from '../../domain/types';
import { it } from '../i18n/it';
import styles from './RangeFlag.module.css';

interface RangeFlagProps {
  outOfRange: OutOfRange;
  value: number | null;
  refMin: number | null;
  refMax: number | null;
  /** True when the report prints any reference for this value. */
  hasReference: boolean;
}

/** The words that go with the rail: "sopra", "sotto", "non valutabile". Nothing when in range. */
export function RangeFlag({ outOfRange, value, refMin, refMax, hasReference }: RangeFlagProps) {
  if (outOfRange === false) return null;
  if (outOfRange === null) {
    return (
      <span className={styles.muted}>
        {hasReference ? it.range.notEvaluable : it.range.noRange}
      </span>
    );
  }
  const below = value !== null && refMin !== null && value < refMin;
  const above = value !== null && refMax !== null && value > refMax;
  if (!below && !above) return <span className={styles.out}>{it.range.out}</span>;
  return (
    <span className={styles.out}>
      <svg viewBox="0 0 10 10" aria-hidden="true">
        <path d={above ? 'M5 1 9.5 9h-9z' : 'M5 9 .5 1h9z'} />
      </svg>
      {above ? it.range.above : it.range.below}
    </span>
  );
}
