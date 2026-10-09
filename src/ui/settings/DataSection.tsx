import { useCallback, useRef, useState } from 'react';
import type { ImportPreview } from '../../storage/backup/backup-service';
import { useServices } from '../app/services';
import { useQuery } from '../app/use-query';
import { formatBytes, formatDateLong, it } from '../i18n/it';
import shared from '../styles/shared.module.css';
import { backupState, dayOf } from '../app/backup-state';
import { ImportDialog } from './ImportDialog';
import { ImportNotice, importNotice, type Notice } from './import-notice';
import styles from './settings.module.css';
import type { Exporter } from '../app/use-export';

/** Export, the state of the last backup, and import. */
export function DataSection({ exporter }: { exporter: Exporter }) {
  const { backup, reports, settings } = useServices();
  const [withFiles, setWithFiles] = useState(false);
  const [pending, setPending] = useState<{
    /** A new dialog per file, so a second pick never inherits the first one's step. */
    id: number;
    raw: unknown;
    preview: ImportPreview;
    localReports: number;
  } | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const picks = useRef(0);
  // While an import runs, a new file must not swap the dialog under it. A ref answers at once.
  const importing = useRef(false);
  const [importBusy, setImportBusy] = useState(false);

  async function onFile(file: File | undefined) {
    if (!file || importing.current) return;
    setNotice(null);
    setDone(null);
    let raw: unknown;
    try {
      raw = JSON.parse(await file.text());
    } catch {
      setNotice({ message: it.settings.data.notJson, issues: [] });
      return;
    }
    try {
      const preview = await backup.previewImport(raw);
      const localReports = (await reports.listReports()).length;
      if (importing.current) return;
      setPending({ id: ++picks.current, raw, preview, localReports });
    } catch (error) {
      setNotice(importNotice(error));
    }
  }

  // The files change only with the reports: a settings change (the theme) must not recount them.
  const attachmentsQuery = useQuery(
    useCallback(() => reports.attachmentSummary(), [reports]),
    reports.subscribe,
  );
  const subscribeBoth = useCallback(
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
  const stateQuery = useQuery(
    useCallback(
      async () =>
        backupState({
          lastExportAt: await settings.get('lastExportAt'),
          dataChangedAt: await settings.get('dataChangedAt'),
        }),
      [settings],
    ),
    subscribeBoth,
  );

  // Export and import stay usable even when one of these reads fails or is still running.
  const d = it.settings.data;
  const attachments = attachmentsQuery.status === 'ready' ? attachmentsQuery.data : null;
  const state = stateQuery.status === 'ready' ? stateQuery.data : null;
  const lastDay = state && state.lastExportAt !== null ? dayOf(state.lastExportAt) : null;
  return (
    <section className={styles.section} aria-labelledby="settings-data">
      {done && (
        <p className={shared.toast} role="status">
          {done}
        </p>
      )}
      <h2 id="settings-data" className={shared.sectionTitle}>
        {d.title}
      </h2>
      <div className={styles.body}>
        <p className={styles.status} role="status">
          {state && (lastDay === null ? d.neverExported : d.lastExport(formatDateLong(lastDay)))}
          {lastDay !== null && state?.pending && <> {d.pending}</>}
        </p>
        {attachments && attachments.count > 0 && (
          <label className={styles.check}>
            <input
              type="checkbox"
              checked={withFiles}
              onChange={(event) => setWithFiles(event.target.checked)}
            />
            {d.includeFiles(attachments.count, formatBytes(attachments.bytes))}
          </label>
        )}
        <button
          type="button"
          className={`${shared.primary} ${styles.busyButton}`}
          aria-disabled={exporter.busy || undefined}
          onClick={() => void exporter.run({ includeAttachments: withFiles })}
        >
          {exporter.busy ? d.exporting : d.export}
        </button>
        {exporter.failed && (
          <p className={shared.alert} role="alert">
            {d.exportFailed}
          </p>
        )}
        <input
          id="import-file"
          type="file"
          accept=".json,application/json"
          className={`visually-hidden ${styles.fileInput}`}
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = ''; // the same file can be chosen again
            void onFile(file);
          }}
        />
        <label
          htmlFor="import-file"
          className={`${shared.secondary} ${styles.fileButton} ${styles.busyButton}`}
          aria-disabled={importBusy || undefined}
        >
          {d.import}
        </label>
        {notice && <ImportNotice notice={notice} />}
      </div>
      {pending && (
        <ImportDialog
          key={pending.id}
          raw={pending.raw}
          preview={pending.preview}
          localReports={pending.localReports}
          localAttachments={attachments?.count ?? 0}
          onCancel={() => setPending(null)}
          onBusyChange={(busy) => {
            importing.current = busy;
            setImportBusy(busy);
          }}
          onImported={(result) => {
            setPending(null);
            setDone(d.imported(result.added, result.skipped));
          }}
        />
      )}
    </section>
  );
}
