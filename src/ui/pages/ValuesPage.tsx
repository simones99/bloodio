import { useCallback, useMemo } from 'react';
import { Link, useSearchParams } from 'react-router';
import { formatRowValue, hasReference } from '../analyte/analyte-view';
import { buildValueList, type ValueListItem } from '../analyte/value-list';
import { useServices } from '../app/services';
import { useQuery } from '../app/use-query';
import { Rail } from '../components/Rail';
import { RangeFlag } from '../components/RangeFlag';
import { formatDateShort, it } from '../i18n/it';
import shared from '../styles/shared.module.css';
import styles from './ValuesPage.module.css';

function ValueRow({ item }: { item: ValueListItem }) {
  const { row } = item;
  return (
    <Link to={item.path} className={styles.row}>
      <span className={styles.name}>{item.name}</span>
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
            watch={item.watch}
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
        <span className={styles.date}>{formatDateShort(row.sampleDate)}</span>
      </div>
    </Link>
  );
}

/** Every entry measured at least once, by category, with its latest value and a search box. */
export function ValuesPage() {
  const { reports, customAnalytes, settings } = useServices();
  // The query lives in the URL so it survives a trip to an entry and back.
  const [params, setParams] = useSearchParams();
  const query = params.get('q') ?? '';
  const setQuery = (value: string) => setParams(value ? { q: value } : {}, { replace: true });

  const subscribe = useCallback(
    (listener: () => void) => {
      const offReports = reports.subscribe(listener);
      const offSettings = settings.subscribe(listener);
      return () => {
        offReports();
        offSettings();
      };
    },
    [reports, settings],
  );
  const loaded = useQuery(
    useCallback(
      async () => ({
        entries: await reports.listLatestPerAnalyte(),
        custom: await customAnalytes.list(),
        preferred: await settings.get('preferredUnits'),
      }),
      [reports, customAnalytes, settings],
    ),
    subscribe,
  );

  const groups = useMemo(
    () =>
      loaded.status === 'ready'
        ? buildValueList(loaded.data.entries, loaded.data.custom, loaded.data.preferred, query)
        : [],
    [loaded, query],
  );

  if (loaded.status === 'error') {
    return (
      <p className={shared.alert} role="alert">
        {it.values.loadFailed}
      </p>
    );
  }
  if (loaded.status !== 'ready') return null;

  return (
    <>
      <header className={shared.pageHead}>
        <h1 className={`display ${shared.pageTitle}`}>{it.values.title}</h1>
      </header>

      {loaded.data.entries.length === 0 ? (
        <div className={shared.empty}>
          <p>{it.values.empty}</p>
          <Link to="/import" className={shared.primary}>
            {it.values.load}
          </Link>
        </div>
      ) : (
        <>
          <div className={`${shared.field} ${styles.search}`}>
            <label htmlFor="values-search">{it.values.search}</label>
            <input
              id="values-search"
              type="search"
              className={shared.input}
              placeholder={it.values.searchPlaceholder}
              autoComplete="off"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>
          {groups.length === 0 ? (
            <p className={shared.empty} role="status">
              {it.values.noMatch}
            </p>
          ) : (
            groups.map((group) => (
              <section key={group.category} aria-labelledby={`values-${group.category}`}>
                <h2 id={`values-${group.category}`} className={shared.sectionTitle}>
                  {it.category[group.category]}
                </h2>
                <ul className={styles.list}>
                  {group.items.map((item) => (
                    <li key={item.key}>
                      <ValueRow item={item} />
                    </li>
                  ))}
                </ul>
              </section>
            ))
          )}
        </>
      )}
    </>
  );
}
