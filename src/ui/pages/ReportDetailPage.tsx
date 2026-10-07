import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import { getAnalyte } from '../../domain/catalog';
import {
  analyteRefOf,
  type Category,
  type CustomAnalyte,
  type Measurement,
} from '../../domain/types';
import { analytePath } from '../analyte/analyte-view';
import { Rail } from '../components/Rail';
import { RangeFlag } from '../components/RangeFlag';
import { useServices } from '../app/services';
import { useModalFocus } from '../app/use-modal-focus';
import { useQuery } from '../app/use-query';
import { useImportSession } from '../import/import-session';
import { formatDateLong, formatDisplayNumber, it } from '../i18n/it';
import shared from '../styles/shared.module.css';
import styles from './ReportDetailPage.module.css';

interface Line {
  measurement: Measurement;
  name: string;
  category: Category;
}

function describe(measurement: Measurement, custom: CustomAnalyte[]): Line {
  const analyte = measurement.analyteId ? getAnalyte(measurement.analyteId) : undefined;
  const own = custom.find((c) => c.id === measurement.customAnalyteId);
  return {
    measurement,
    name: analyte?.name ?? own?.name ?? '—',
    category: analyte?.category ?? own?.category ?? 'altro',
  };
}

function valueLabel(m: Measurement): string {
  return m.value === null ? m.valueText : `${m.comparator ?? ''}${formatDisplayNumber(m.value)}`;
}

interface DeleteConfirmProps {
  onCancel(): void;
  onConfirm(): Promise<void>;
}

/** Mounted only while confirming, so its focus trap opens and closes with the dialog itself. */
function DeleteConfirm({ onCancel, onConfirm }: DeleteConfirmProps) {
  const [error, setError] = useState<string | null>(null);
  const { ref: dialog, onKeyDown } = useModalFocus<HTMLDivElement>(onCancel);
  const cancelButton = useRef<HTMLButtonElement>(null);

  // Runs after useModalFocus's effect has captured the opener, so that capture sees the
  // trigger, not this button (autoFocus would move focus before any effect runs).
  useEffect(() => {
    cancelButton.current?.focus();
  }, []);

  return (
    <div
      ref={dialog}
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="delete-title"
      aria-describedby="delete-body"
      className={styles.confirm}
      onKeyDown={onKeyDown}
    >
      <h2 id="delete-title">{it.detail.deleteTitle}</h2>
      <p id="delete-body">{it.detail.deleteBody}</p>
      <div className={styles.confirmActions}>
        <button type="button" className={shared.secondary} onClick={onCancel} ref={cancelButton}>
          {it.detail.cancel}
        </button>
        <button
          type="button"
          className={shared.primary}
          onClick={async () => {
            try {
              await onConfirm();
            } catch {
              setError(it.detail.deleteFailed);
            }
          }}
        >
          {it.detail.deleteConfirm}
        </button>
      </div>
      {error && (
        <p className={shared.alert} role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

export function ReportDetailPage() {
  const { id = '' } = useParams();
  const [search] = useSearchParams();
  const navigate = useNavigate();
  const { reports, customAnalytes } = useServices();
  const { setSession } = useImportSession();
  const [confirming, setConfirming] = useState(false);

  const loaded = useQuery(
    useCallback(
      async () => ({ found: await reports.getReport(id), custom: await customAnalytes.list() }),
      [reports, customAnalytes, id],
    ),
    reports.subscribe,
  );

  const groups = useMemo(() => {
    if (loaded.status !== 'ready' || !loaded.data.found) return [];
    const byCategory = new Map<Category, Line[]>();
    for (const measurement of loaded.data.found.measurements) {
      const line = describe(measurement, loaded.data.custom);
      byCategory.set(line.category, [...(byCategory.get(line.category) ?? []), line]);
    }
    return [...byCategory.entries()];
  }, [loaded]);

  if (loaded.status !== 'ready') return null;
  if (!loaded.data.found) {
    return (
      <div className={shared.empty}>
        <p>{it.detail.notFound}</p>
        <Link to="/reports" className={shared.secondary}>
          {it.detail.back}
        </Link>
      </div>
    );
  }

  const { report, measurements } = loaded.data.found;
  const justSaved = search.get('saved') === '1';
  const justUpdated = search.get('updated') === '1';
  let railIndex = 0;

  return (
    <>
      {justSaved && (
        <p className={shared.toast} role="status">
          {it.detail.saved}
        </p>
      )}
      {justUpdated && (
        <p className={shared.toast} role="status">
          {it.detail.updated}
        </p>
      )}
      <header className={shared.pageHead}>
        <Link to="/reports" className={shared.backLink}>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M15 5l-7 7 7 7" />
          </svg>
          {it.detail.back}
        </Link>
        <h1 className={`display ${shared.pageTitle}`}>{formatDateLong(report.sampleDate)}</h1>
        <p className={shared.lead}>
          {[report.lab, it.reportType[report.type]].filter(Boolean).join(', ')}
        </p>
      </header>

      <div className={styles.actions}>
        <button
          type="button"
          className={shared.secondary}
          onClick={() => {
            setSession({ mode: 'edit', reportId: report.id, report, measurements });
            navigate('/import/verify');
          }}
        >
          {it.detail.edit}
        </button>
      </div>

      {groups.map(([category, lines]) => (
        <section key={category} aria-labelledby={`cat-${category}`}>
          <h2 id={`cat-${category}`} className={shared.sectionTitle}>
            {it.category[category]}
          </h2>
          {lines.map(({ measurement: m, name }) => (
            <div key={m.id} className={styles.row}>
              {analyteRefOf(m) ? (
                <Link to={analytePath(analyteRefOf(m)!)} className={styles.name}>
                  {name}
                </Link>
              ) : (
                <span className={styles.name}>{name}</span>
              )}
              <span className={styles.value}>
                {valueLabel(m)}
                {m.unit && <small>{m.unit}</small>}
              </span>
              {m.value !== null && (
                <div className={styles.rail}>
                  <Rail
                    value={m.value}
                    refMin={m.refMin}
                    refMax={m.refMax}
                    comparator={m.comparator}
                    animateIndex={justSaved ? railIndex++ : undefined}
                  />
                </div>
              )}
              <div className={styles.meta}>
                <RangeFlag
                  outOfRange={m.outOfRange}
                  value={m.value}
                  refMin={m.refMin}
                  refMax={m.refMax}
                  hasReference={m.refText !== null || m.refMin !== null || m.refMax !== null}
                />
                <span className={styles.ref}>{m.refText?.split('\n').join('; ')}</span>
              </div>
            </div>
          ))}
        </section>
      ))}

      {report.notes && (
        <section>
          <h2 className={shared.sectionTitle}>{it.detail.notes}</h2>
          <p className={styles.notes}>{report.notes}</p>
        </section>
      )}

      <div className={styles.danger}>
        {/* Kept mounted (just hidden) while confirming, so closing the dialog can restore focus here. */}
        <button
          type="button"
          className={shared.textButton}
          hidden={confirming}
          onClick={() => setConfirming(true)}
        >
          {it.detail.delete}
        </button>
        {confirming && (
          <DeleteConfirm
            onCancel={() => setConfirming(false)}
            onConfirm={async () => {
              await reports.deleteReport(report.id);
              navigate('/reports', { replace: true });
            }}
          />
        )}
      </div>
    </>
  );
}
