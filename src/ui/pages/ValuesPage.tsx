import { useCallback, useMemo } from 'react';
import { Link, useSearchParams } from 'react-router';
import { buildValueList } from '../analyte/value-list';
import { useServices } from '../app/services';
import { useQuery } from '../app/use-query';
import { ValueRow } from '../components/ValueRow';
import { it } from '../i18n/it';
import shared from '../styles/shared.module.css';
import styles from './ValuesPage.module.css';

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
        system: await settings.get('unitSystem'),
      }),
      [reports, customAnalytes, settings],
    ),
    subscribe,
  );

  const groups = useMemo(
    () =>
      loaded.status === 'ready'
        ? buildValueList(
            loaded.data.entries,
            loaded.data.custom,
            loaded.data.preferred,
            query,
            loaded.data.system,
          )
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
                      <ValueRow
                        name={item.name}
                        path={item.path}
                        row={item.row}
                        watch={item.watch}
                      />
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
