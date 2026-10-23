import type { CSSProperties } from 'react';
import type { Comparator } from '../../domain/types';
import { railPosition } from './rail-position';
import styles from './Rail.module.css';

interface RailProps {
  value: number | null;
  /** The older value in a comparison, drawn as a ring on the same range. */
  from?: number | null;
  refMin: number | null;
  refMax: number | null;
  comparator?: Comparator | null;
  /** Close to a limit and moving towards it. */
  watch?: boolean;
  /** Stagger index for the one orchestrated animation after saving a report. */
  animateIndex?: number;
}

/**
 * The printed range as a track, the value as a point. Decorative on purpose: the text next to it
 * ("sopra", "sotto", the numbers) carries the same information for assistive technology.
 */
export function Rail({
  value,
  from = null,
  refMin,
  refMax,
  comparator = null,
  watch = false,
  animateIndex,
}: RailProps) {
  const position = value === null ? null : railPosition(value, refMin, refMax);
  const previous = from === null ? null : railPosition(from, refMin, refMax);
  if (!position && !previous) return <div className={styles.rail} data-empty aria-hidden="true" />;

  const kind = !position
    ? null
    : position.state !== 'in'
      ? 'out'
      : comparator
        ? 'open'
        : watch
          ? 'watch'
          : 'in';
  return (
    <div
      className={styles.rail}
      aria-hidden="true"
      data-animate={animateIndex !== undefined || undefined}
    >
      {previous && position && (
        <i
          className={styles.link}
          style={
            {
              '--from': `${Math.min(previous.x, position.x)}%`,
              '--to': `${Math.max(previous.x, position.x)}%`,
            } as CSSProperties
          }
        />
      )}
      {previous && (
        <i
          className={styles.dot}
          data-kind="from"
          style={{ '--x': `${previous.x}%` } as CSSProperties}
        />
      )}
      {position && (
        <i
          className={styles.dot}
          data-kind={kind ?? undefined}
          style={{ '--x': `${position.x}%`, '--i': animateIndex ?? 0 } as CSSProperties}
        />
      )}
    </div>
  );
}
