import { getAnalyte } from '../../domain/catalog';
import type { Comparator, CustomAnalyte } from '../../domain/types';
import {
  ambiguousReadings,
  isPending,
  parseUserNumber,
  rowProblems,
  withReading,
  type EditableRow,
} from '../../parsers/editable';
import { Rail } from '../components/Rail';
import { formatDateLong, it } from '../i18n/it';
import shared from '../styles/shared.module.css';
import styles from './VerifyRow.module.css';

interface VerifyRowProps {
  row: EditableRow;
  custom: CustomAnalyte[];
  /** Show what is missing only after the user tried to save. */
  showProblems: boolean;
  onChange(row: EditableRow): void;
  onDelete(): void;
  onPickAnalyte(): void;
  onUseSuggestion(analyteId: string): void;
}

function analyteLabel(row: EditableRow, custom: CustomAnalyte[]): string | null {
  if (row.analyteId) return getAnalyte(row.analyteId)?.name ?? row.analyteId;
  if (row.customAnalyteId) return custom.find((c) => c.id === row.customAnalyteId)?.name ?? null;
  return null;
}

const VALUE_PATTERN = /^(<=|>=|<|>)?\s*(\d+(?:[.,]\d+)?)$/;

function previewValue(text: string): number | null {
  const match = VALUE_PATTERN.exec(text.trim());
  return match?.[2] === undefined ? null : parseUserNumber(match[2]);
}

function previewComparator(text: string): Comparator | null {
  const match = VALUE_PATTERN.exec(text.trim());
  return (match?.[1] as Comparator | undefined) ?? null;
}

export function VerifyRow({
  row,
  custom,
  showProblems,
  onChange,
  onDelete,
  onPickAnalyte,
  onUseSuggestion,
}: VerifyRowProps) {
  const pending = isPending(row);
  const problems = rowProblems(row);
  const label = analyteLabel(row, custom);
  const suggestion = row.suggestionId ? getAnalyte(row.suggestionId) : undefined;
  const readings = ambiguousReadings(row);
  const id = (field: string) => `${row.key}-${field}`;
  const set = (patch: Partial<EditableRow>) => onChange({ ...row, ...patch });
  const invalid = (problem: (typeof problems)[number]) =>
    (showProblems && problems.includes(problem)) || undefined;

  return (
    <article
      className={styles.row}
      data-pending={pending || undefined}
      aria-label={label ?? (row.name || it.verify.addRow)}
    >
      <header className={styles.top}>
        <div>
          <h3 className={styles.name}>{label ?? (row.name || it.verify.chooseAnalyte)}</h3>
          {label && row.name && normalize(label) !== normalize(row.name) && (
            <p className={styles.printed}>{row.name}</p>
          )}
        </div>
        <span className={styles.state}>
          {row.confirmed ? it.verify.confirmed : pending ? '' : it.verify.readWell}
        </span>
      </header>

      <button
        type="button"
        className={styles.analyte}
        onClick={onPickAnalyte}
        aria-invalid={invalid('no-analyte')}
      >
        <span className={shared.fieldLabel}>{it.verify.analyte}</span>
        <span>{label ?? it.verify.chooseAnalyte}</span>
      </button>

      {suggestion && (
        <p className={styles.reason}>
          {it.verify.maybe(suggestion.name)}{' '}
          <button
            type="button"
            className={styles.inline}
            onClick={() => onUseSuggestion(suggestion.id)}
          >
            {it.verify.useSuggestion}
          </button>
        </p>
      )}

      <div className={styles.grid}>
        <div className={shared.field}>
          <label htmlFor={id('value')}>{it.verify.value}</label>
          <input
            id={id('value')}
            className={`${shared.input} ${styles.number}`}
            value={row.valueText}
            inputMode="text"
            autoComplete="off"
            aria-invalid={invalid('no-value')}
            onChange={(event) => set({ valueText: event.target.value })}
          />
          {row.origin && row.origin.rawValue !== row.valueText && (
            <p className={styles.printed}>{it.verify.printed(row.origin.rawValue)}</p>
          )}
        </div>
        <div className={shared.field}>
          <label htmlFor={id('unit')}>{it.verify.unit}</label>
          <input
            id={id('unit')}
            className={shared.input}
            value={row.unit}
            autoComplete="off"
            autoCapitalize="off"
            onChange={(event) => set({ unit: event.target.value, suggestedReference: null })}
          />
        </div>
        <div className={shared.field}>
          <label htmlFor={id('min')}>{it.verify.refMin}</label>
          <input
            id={id('min')}
            className={`${shared.input} ${styles.number}`}
            value={row.refMinText}
            inputMode="decimal"
            autoComplete="off"
            aria-invalid={invalid('bad-ref-min') || invalid('ref-order')}
            onChange={(event) => set({ refMinText: event.target.value, suggestedReference: null })}
          />
        </div>
        <div className={shared.field}>
          <label htmlFor={id('max')}>{it.verify.refMax}</label>
          <input
            id={id('max')}
            className={`${shared.input} ${styles.number}`}
            value={row.refMaxText}
            inputMode="decimal"
            autoComplete="off"
            aria-invalid={invalid('bad-ref-max') || invalid('ref-order')}
            onChange={(event) => set({ refMaxText: event.target.value, suggestedReference: null })}
          />
        </div>
      </div>

      {row.suggestedReference && (
        <p className={styles.printed}>
          {it.verify.suggestedReference(formatDateLong(row.suggestedReference.sampleDate))}
        </p>
      )}

      {row.refText && <p className={styles.printed}>{row.refText.split('\n').join('; ')}</p>}

      <Rail
        value={previewValue(row.valueText)}
        refMin={parseUserNumber(row.refMinText)}
        refMax={parseUserNumber(row.refMaxText)}
        comparator={previewComparator(row.valueText)}
      />

      {row.flags.map((flag) => (
        <p key={flag} className={styles.reason}>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M12 3 2.5 20h19zM12 10v4.5M12 17.5v.1" />
          </svg>
          {it.verify.flags[flag]}
        </p>
      ))}

      {readings && (
        <div className={styles.choice}>
          {readings.map((reading) => (
            <button
              key={reading}
              type="button"
              aria-pressed={row.valueText === reading}
              onClick={() => onChange(withReading(row, reading))}
            >
              {reading}
            </button>
          ))}
        </div>
      )}

      {showProblems &&
        problems.map((problem) => (
          <p key={problem} className={styles.problem} role="alert">
            {it.verify.problems[problem]}
          </p>
        ))}

      <footer className={styles.actions}>
        {pending && (
          <button type="button" className={styles.confirm} onClick={() => set({ confirmed: true })}>
            {it.verify.confirmRow}
          </button>
        )}
        <button type="button" className={shared.textButton} onClick={onDelete}>
          {it.verify.deleteRow}
        </button>
      </footer>
    </article>
  );
}

const normalize = (text: string) => text.trim().toLowerCase();
