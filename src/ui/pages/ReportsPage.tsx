import { useCallback, useState } from 'react';
import { Link } from 'react-router';
import type { ReportType } from '../../domain/types';
import { useServices } from '../app/services';
import { useQuery } from '../app/use-query';
import { formatDateShort, it } from '../i18n/it';
import shared from '../styles/shared.module.css';
import styles from './ReportsPage.module.css';

const TYPES: ReportType[] = ['sangue', 'urine', 'altro'];

export function ReportsPage() {
  const { reports } = useServices();
  const [type, setType] = useState<ReportType | undefined>();
  const [lab, setLab] = useState<string | undefined>();

  const summaries = useQuery(
    useCallback(() => reports.listReportSummaries({ type, lab }), [reports, type, lab]),
    reports.subscribe,
  );
  const labs = useQuery(
    useCallback(() => reports.listLabs(), [reports]),
    reports.subscribe,
  );

  if (summaries.status !== 'ready' || labs.status !== 'ready') return null;
  const filtering = type !== undefined || lab !== undefined;

  return (
    <>
      <header className={shared.pageHead}>
        <h1 className={`display ${shared.pageTitle}`}>{it.reports.title}</h1>
      </header>

      {summaries.data.length === 0 && !filtering ? (
        <div className={shared.empty}>
          <p>{it.reports.empty}</p>
          <Link to="/import" className={`${shared.primary} ${styles.cta}`}>
            {it.reports.load}
          </Link>
        </div>
      ) : (
        <>
          <div className={shared.chips} role="group" aria-label={it.verify.type}>
            <button
              type="button"
              className={shared.chip}
              aria-pressed={type === undefined}
              onClick={() => setType(undefined)}
            >
              {it.reports.allTypes}
            </button>
            {TYPES.map((t) => (
              <button
                key={t}
                type="button"
                className={shared.chip}
                aria-pressed={type === t}
                onClick={() => setType(t)}
              >
                {it.reportType[t]}
              </button>
            ))}
          </div>
          {labs.data.length > 1 && (
            <div className={shared.chips} role="group" aria-label={it.verify.lab}>
              <button
                type="button"
                className={shared.chip}
                aria-pressed={lab === undefined}
                onClick={() => setLab(undefined)}
              >
                {it.reports.allLabs}
              </button>
              {labs.data.map((name) => (
                <button
                  key={name}
                  type="button"
                  className={shared.chip}
                  aria-pressed={lab === name}
                  onClick={() => setLab(name)}
                >
                  {name}
                </button>
              ))}
            </div>
          )}

          {summaries.data.length === 0 ? (
            <p className={shared.empty}>{it.reports.emptyFiltered}</p>
          ) : (
            <ul className={styles.list}>
              {summaries.data.map(({ report, total, outOfRange }) => (
                <li key={report.id}>
                  <Link to={`/reports/${report.id}`} className={styles.row}>
                    <span className={`display ${styles.date}`}>
                      {formatDateShort(report.sampleDate)}
                    </span>
                    <span className={styles.meta}>
                      {report.lab || it.reportType[report.type]}, {it.reports.values(total)}
                    </span>
                    {outOfRange > 0 && (
                      <span className={styles.out}>{it.reports.outOfRange(outOfRange)}</span>
                    )}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </>
  );
}
