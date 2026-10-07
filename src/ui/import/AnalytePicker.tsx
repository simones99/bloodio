import { useEffect, useMemo, useRef, useState } from 'react';
import { CATALOG } from '../../domain/catalog';
import { normalizeName } from '../../domain/normalize';
import type { CustomAnalyte } from '../../domain/types';
import { useModalFocus } from '../app/use-modal-focus';
import { searchByName } from '../analyte/search';
import { it } from '../i18n/it';
import shared from '../styles/shared.module.css';
import styles from './AnalytePicker.module.css';

export type AnalyteChoice =
  { analyteId: string } | { customAnalyteId: string } | { createCustom: string };

interface AnalytePickerProps {
  /** Text to start the search from: the name printed on the report. */
  initialQuery: string;
  custom: CustomAnalyte[];
  onChoose(choice: AnalyteChoice): void;
  onClose(): void;
}

interface Option {
  key: string;
  label: string;
  detail: string;
  haystack: string[];
  choice: AnalyteChoice;
}

const MAX_RESULTS = 12;

/** Full-height sheet to search the catalog, pick a custom analyte, or create one. */
export function AnalytePicker({ initialQuery, custom, onChoose, onClose }: AnalytePickerProps) {
  const [query, setQuery] = useState(initialQuery);
  const search = useRef<HTMLInputElement>(null);
  const { ref: sheet, onKeyDown } = useModalFocus<HTMLDivElement>(onClose);

  useEffect(() => {
    search.current?.focus();
    search.current?.select();
  }, []);

  const options = useMemo<Option[]>(
    () => [
      ...CATALOG.map((a) => ({
        key: a.id,
        label: a.name,
        detail: [it.category[a.category], a.canonicalUnit].filter(Boolean).join(', '),
        haystack: [a.name, ...a.aliases].map(normalizeName),
        choice: { analyteId: a.id },
      })),
      ...custom.map((c) => ({
        key: `custom:${c.id}`,
        label: c.name,
        detail: it.picker.custom,
        haystack: [normalizeName(c.name)],
        choice: { customAnalyteId: c.id },
      })),
    ],
    [custom],
  );

  const needle = normalizeName(query);
  const results = useMemo(
    () => searchByName(options, query, (o) => o.haystack).slice(0, MAX_RESULTS),
    [query, options],
  );

  const typed = query.trim();
  const exists = options.some((o) => o.haystack.includes(needle));

  return (
    <div
      ref={sheet}
      className={styles.sheet}
      role="dialog"
      aria-modal="true"
      aria-labelledby="picker-title"
      onKeyDown={onKeyDown}
    >
      <div className={styles.head}>
        <h2 id="picker-title" className={styles.title}>
          {it.picker.title}
        </h2>
        <button type="button" className={shared.textButton} onClick={onClose}>
          {it.picker.close}
        </button>
      </div>
      <div className={styles.search}>
        <label htmlFor="picker-search" className={shared.fieldLabel}>
          {it.picker.search}
        </label>
        <input
          ref={search}
          id="picker-search"
          className={shared.input}
          value={query}
          autoComplete="off"
          onChange={(event) => setQuery(event.target.value)}
        />
      </div>
      <ul className={styles.results}>
        {results.map((option) => (
          <li key={option.key}>
            <button type="button" className={styles.option} onClick={() => onChoose(option.choice)}>
              <span>{option.label}</span>
              <small>{option.detail}</small>
            </button>
          </li>
        ))}
        {results.length === 0 && <li className={styles.none}>{it.picker.empty}</li>}
        {typed !== '' && !exists && (
          <li>
            <button
              type="button"
              className={styles.create}
              onClick={() => onChoose({ createCustom: typed })}
            >
              {it.picker.createCustom(typed)}
            </button>
          </li>
        )}
      </ul>
    </div>
  );
}
