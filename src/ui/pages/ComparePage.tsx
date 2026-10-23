import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router';
import type { Report } from '../../domain/types';
import { useServices } from '../app/services';
import { useQuery } from '../app/use-query';
import { CompareRow } from '../compare/CompareRow';
import { CompareSheet } from '../compare/CompareSheet';
import { buildComparison, comparePath } from '../compare/compare-view';
import { chronological } from '../compare/previous';
import { formatDateLong, it } from '../i18n/it';
import shared from '../styles/shared.module.css';
import styles from './ComparePage.module.css';

/** Navigation state: the report whose detail opened the comparison. */
interface CompareState {
  from?: string;
}

export function ComparePage() {
  const [search] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { reports, customAnalytes, settings } = useServices();
  const a = search.get('a') ?? '';
  const b = search.get('b') ?? '';
  const from = (location.state as CompareState | null)?.from ?? null;
  const [onlyCommon, setOnlyCommon] = useState(false);
  const [choosing, setChoosing] = useState(false);
  const changeButton = useRef<HTMLButtonElement>(null);
  // Set when a choice in the sheet replaces the pair: the new comparison takes the focus back.
  const refocusChange = useRef(false);

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
    useCallback(async () => {
      const [first, second, custom, preferred, system] = await Promise.all([
        a ? reports.getReport(a) : Promise.resolve(undefined),
        b ? reports.getReport(b) : Promise.resolve(undefined),
        customAnalytes.list(),
        settings.get('preferredUnits'),
        settings.get('unitSystem'),
      ]);
      return { first, second, custom, preferred, system };
    }, [reports, customAnalytes, settings, a, b]),
    subscribe,
  );
  // Only the sheet needs every report: a query of its own keeps the comparison from waiting.
  const others = useQuery(
    useCallback(async () => {
      const [all, refs] = await Promise.all([
        reports.listReports(),
        reports.listEntryRefsByReport(),
      ]);
      return { all, refs };
    }, [reports]),
    reports.subscribe,
  );

  const view = useMemo(() => {
    if (loaded.status !== 'ready') return null;
    const { first, second, custom, preferred, system } = loaded.data;
    if (!first || !second || first.report.id === second.report.id) return null;
    const [older] = chronological(first.report, second.report);
    const [olderData, newerData] = older === first.report ? [first, second] : [second, first];
    return {
      older: olderData.report,
      newer: newerData.report,
      comparison: buildComparison({
        older: olderData,
        newer: newerData,
        custom,
        preferred,
        system,
      }),
    };
  }, [loaded]);
  const same =
    loaded.status === 'ready' &&
    loaded.data.first !== undefined &&
    loaded.data.first.report.id === loaded.data.second?.report.id;
  const gone = loaded.status === 'ready' && !view && !same;

  // A sheet left open over a comparison that disappeared (a report deleted) must not come back.
  useEffect(() => {
    if (gone) setChoosing(false);
  }, [gone]);

  // No deps: runs after every render, and acts once the new comparison's chip is mounted.
  // A choice that ends on no comparison (a report gone, a failed read) drops the pending focus:
  // while the pair switches, the old data still says `same`, so `gone` stays false until then.
  useEffect(() => {
    if (refocusChange.current && changeButton.current) {
      refocusChange.current = false;
      changeButton.current.focus();
    } else if (refocusChange.current && (gone || loaded.status === 'error')) {
      refocusChange.current = false;
    }
  });

  if (loaded.status === 'loading') return null;
  if (loaded.status === 'error') {
    return (
      <p className={shared.alert} role="alert">
        {it.compare.loadFailed}
      </p>
    );
  }

  const { first } = loaded.data;
  const sheetData = others.status === 'ready' ? others.data : null;
  const chooseFor = (fixed: Report) => (id: string) => {
    refocusChange.current = true;
    setChoosing(false);
    navigate(comparePath(id, fixed.id), { replace: true, state: location.state });
  };
  const sheet = (fixed: Report, selected: string | null) =>
    choosing &&
    sheetData && (
      <CompareSheet
        fixed={fixed}
        reports={sheetData.all}
        refs={sheetData.refs}
        selected={selected}
        onChoose={chooseFor(fixed)}
        onClose={() => setChoosing(false)}
      />
    );

  if (same && first) {
    return (
      <div className={shared.empty}>
        <p>{it.compare.sameReport}</p>
        <button
          type="button"
          className={shared.secondary}
          disabled={!sheetData}
          onClick={() => setChoosing(true)}
        >
          {it.compare.change}
        </button>
        {others.status === 'error' && (
          <Link to="/reports" className={shared.secondary}>
            {it.compare.toReports}
          </Link>
        )}
        {sheet(first.report, null)}
      </div>
    );
  }

  if (!view) {
    return (
      <div className={shared.empty}>
        <p>{it.compare.notFound}</p>
        <Link to="/reports" className={shared.secondary}>
          {it.compare.toReports}
        </Link>
      </div>
    );
  }

  const { older, newer, comparison } = view;
  const origin = from === older.id ? older : from === newer.id ? newer : null;
  const fixed = origin ?? newer;
  const other = fixed === older ? newer : older;
  const groups = comparison.groups
    .map((g) => ({ ...g, rows: onlyCommon ? g.rows.filter((r) => r.kind !== 'single') : g.rows }))
    .filter((g) => g.rows.length > 0);

  return (
    <>
      <header className={shared.pageHead}>
        <Link to={origin ? `/reports/${origin.id}` : '/reports'} className={shared.backLink}>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M15 5l-7 7 7 7" />
          </svg>
          {origin ? it.compare.backTo(formatDateLong(origin.sampleDate)) : it.detail.back}
        </Link>
        <h1 className={`display ${shared.pageTitle}`}>{it.compare.title}</h1>
        <ul className={styles.pair}>
          {[older, newer].map((report) => (
            <li key={report.id}>
              <i
                className={styles.mark}
                data-kind={report === older ? 'older' : 'newer'}
                aria-hidden="true"
              />
              <span className="visually-hidden">
                {report === older ? it.compare.older : it.compare.newer}:{' '}
              </span>
              <Link to={`/reports/${report.id}`}>{formatDateLong(report.sampleDate)}</Link>
              {report.lab && <small>{report.lab}</small>}
            </li>
          ))}
        </ul>
      </header>

      <div className={shared.chips}>
        <button
          ref={changeButton}
          type="button"
          className={shared.chip}
          disabled={!sheetData}
          onClick={() => setChoosing(true)}
        >
          {it.compare.change}
        </button>
        <button
          type="button"
          className={shared.chip}
          aria-pressed={onlyCommon}
          onClick={() => setOnlyCommon((value) => !value)}
        >
          {it.compare.onlyCommon}
        </button>
      </div>
      <p className={styles.summary}>
        {comparison.common > 0
          ? it.compare.summary(comparison.common, comparison.single)
          : it.compare.noCommon}
      </p>

      <section aria-labelledby="compare-changed">
        <h2 id="compare-changed" className={shared.sectionTitle}>
          {it.compare.changed}
        </h2>
        {comparison.changed.length > 0 ? (
          comparison.changed.map((row) => <CompareRow key={row.key} row={row} />)
        ) : (
          <p className={styles.none}>{it.compare.noneChanged}</p>
        )}
      </section>

      {groups.map(({ category, rows }) => (
        <section key={category} aria-labelledby={`compare-${category}`}>
          <h2 id={`compare-${category}`} className={shared.sectionTitle}>
            {it.category[category]}
          </h2>
          {rows.map((row) => (
            <CompareRow key={row.key} row={row} />
          ))}
        </section>
      ))}
      {onlyCommon && comparison.common === 0 && (
        <p className={styles.none}>{it.compare.noneInCommon}</p>
      )}

      {sheet(fixed, other.id)}
    </>
  );
}
