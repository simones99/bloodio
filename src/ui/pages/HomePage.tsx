import { useCallback, useMemo } from 'react';
import { Link } from 'react-router';
import { backupState, snoozeUntil } from '../app/backup-state';
import { useServices } from '../app/services';
import { useExport } from '../app/use-export';
import { useQuery } from '../app/use-query';
import { ValueRow } from '../components/ValueRow';
import { buildHome, type HomeItem, type HomeList } from '../home/home-view';
import { formatDateLong, formatDateShort, it } from '../i18n/it';
import shared from '../styles/shared.module.css';
import styles from './HomePage.module.css';

function Rows({
  items,
  showDate,
  labelled,
}: {
  items: HomeItem[];
  showDate: boolean;
  labelled: boolean;
}) {
  if (items.length === 0) return null;
  return (
    <ul className={styles.list}>
      {items.map((item) => (
        <li key={item.key}>
          <ValueRow
            name={item.name}
            path={item.path}
            row={item.row}
            watch={item.watch !== null}
            showDate={showDate}
            watchLabel={labelled && item.watch ? it.home.watchLabel[item.watch] : undefined}
          />
        </li>
      ))}
    </ul>
  );
}

/** One list of the Home: the latest report, then older reports, then a count of the oldest. */
function ListSection({
  id,
  title,
  hint,
  list,
  labelled = false,
}: {
  id: string;
  title: string;
  hint?: string;
  list: HomeList;
  labelled?: boolean;
}) {
  if (list.current.length === 0 && list.older.length === 0 && list.olderHidden === 0) return null;
  return (
    <section aria-labelledby={id}>
      <h2 id={id} className={shared.sectionTitle}>
        {title}
      </h2>
      {hint && <p className={styles.hint}>{hint}</p>}
      <Rows items={list.current} showDate={false} labelled={labelled} />
      {list.older.length > 0 && (
        <>
          <h3 className={styles.subTitle}>{it.home.older}</h3>
          <Rows items={list.older} showDate labelled={labelled} />
        </>
      )}
      {list.olderHidden > 0 && (
        <Link to="/analytes" className={styles.more}>
          {it.home.olderHidden(list.olderHidden)}
        </Link>
      )}
    </section>
  );
}

/** Data that no export file holds: export them now, or hide this for a while. */
function BackupReminder() {
  const { reports, settings } = useServices();
  const exporter = useExport();
  const files = useQuery(
    useCallback(() => reports.attachmentSummary(), [reports]),
    reports.subscribe,
  );
  // A count not read yet, or unreadable, counts as files present: "Esporta ora" leaves them out.
  const hasFiles = files.status !== 'ready' || files.data.count > 0;

  function later() {
    // If this write fails the reminder simply stays: the user can tap again.
    void settings.set('backupReminderSnoozedUntil', snoozeUntil(new Date())).catch(() => undefined);
  }

  return (
    <section className={styles.reminder} aria-labelledby="home-backup">
      <h2 id="home-backup" className={styles.reminderText}>
        {it.home.backup.text}
      </h2>
      <div className={styles.actions}>
        <button
          type="button"
          className={`${shared.secondary} ${styles.busy}`}
          aria-disabled={exporter.busy || undefined}
          onClick={() => void exporter.run({ includeAttachments: false })}
        >
          {exporter.busy ? it.settings.data.exporting : it.home.backup.export}
        </button>
        <button type="button" className={shared.textButton} onClick={later}>
          {it.home.backup.later}
        </button>
      </div>
      {hasFiles && (
        <p className={styles.note}>
          {it.home.backup.noFiles} <Link to="/settings">{it.home.backup.toSettings}</Link>
        </p>
      )}
      {exporter.failed && (
        <p className={styles.failed} role="alert">
          {it.settings.data.exportFailed}
        </p>
      )}
    </section>
  );
}

/** The latest report, what to look at, the backup reminder, and the latest reports. */
export function HomePage() {
  const { reports, customAnalytes, settings } = useServices();
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
        summaries: await reports.listReportSummaries(),
        custom: await customAnalytes.list(),
        preferred: await settings.get('preferredUnits'),
        system: await settings.get('unitSystem'),
        backup: backupState({
          lastExportAt: await settings.get('lastExportAt'),
          dataChangedAt: await settings.get('dataChangedAt'),
          snoozedUntil: await settings.get('backupReminderSnoozedUntil'),
        }),
      }),
      [reports, customAnalytes, settings],
    ),
    subscribe,
  );

  const home = useMemo(
    () =>
      loaded.status === 'ready'
        ? buildHome({
            entries: loaded.data.entries,
            summaries: loaded.data.summaries,
            custom: loaded.data.custom,
            preferredUnits: loaded.data.preferred,
            system: loaded.data.system,
            today: new Date(),
          })
        : null,
    [loaded],
  );

  if (loaded.status === 'error') {
    return (
      <p className={shared.alert} role="alert">
        {it.home.loadFailed}
      </p>
    );
  }
  if (loaded.status !== 'ready' || home === null) return null;

  const title = <h1 className="visually-hidden">{it.home.title}</h1>;
  if (home.latest === null) {
    return (
      <>
        {title}
        <div className={shared.empty}>
          <p>{it.reports.empty}</p>
          <Link to="/import" className={`${shared.primary} ${styles.cta}`}>
            {it.reports.load}
          </Link>
        </div>
      </>
    );
  }

  const { report, total, outOfRange, notEvaluable } = home.latest;
  const lab = report.lab || it.reportType[report.type];
  const date = formatDateLong(report.sampleDate);
  return (
    <>
      {title}
      <Link
        to={`/reports/${report.id}`}
        className={styles.slab}
        aria-label={it.home.slabLabel(date, lab, outOfRange)}
      >
        <span className={`display ${styles.brand}`}>{it.appName}</span>
        <span className={`display ${styles.date}`}>{date}</span>
        <span className={styles.lab}>{lab}</span>
        <span className={styles.summary}>
          {it.home.summary(outOfRange, total - outOfRange - notEvaluable, notEvaluable)}
        </span>
      </Link>

      {loaded.data.backup.remind && <BackupReminder />}

      <ListSection id="home-out" title={it.home.outOfRange} list={home.outOfRange} />
      <ListSection
        id="home-watch"
        title={it.home.watch}
        hint={it.home.watchHint}
        list={home.watch}
        labelled
      />

      <section aria-labelledby="home-recent">
        <h2 id="home-recent" className={shared.sectionTitle}>
          {it.home.recent}
        </h2>
        <ul className={styles.list}>
          {home.recent.map((s) => (
            <li key={s.report.id}>
              <Link to={`/reports/${s.report.id}`} className={styles.reportRow}>
                <span className={`display ${styles.reportDate}`}>
                  {formatDateShort(s.report.sampleDate)}
                </span>
                <span className={styles.reportMeta}>
                  {s.report.lab || it.reportType[s.report.type]}, {it.reports.values(s.total)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
        <Link to="/reports" className={styles.more}>
          {it.home.allReports}
        </Link>
      </section>
    </>
  );
}
