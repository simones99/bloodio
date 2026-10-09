import { useEffect, useRef, useState } from 'react';
import type { ImportMode, ImportPreview, ImportResult } from '../../storage/backup/backup-service';
import { useServices } from '../app/services';
import { useModalFocus } from '../app/use-modal-focus';
import { formatDateLong, it } from '../i18n/it';
import shared from '../styles/shared.module.css';
import { dayOf } from '../app/backup-state';
import { ImportNotice, importNotice, type Notice } from './import-notice';
import styles from './settings.module.css';

interface Props {
  raw: unknown;
  preview: ImportPreview;
  /** Reports on this device now: with none, "merge" and "replace" mean the same. */
  localReports: number;
  /** Original files on this device now, 0 when unknown: "replace" deletes them too. */
  localAttachments: number;
  onImported(result: ImportResult): void;
  onCancel(): void;
  /** Told when an import starts and ends, so the page can ignore new files meanwhile. */
  onBusyChange(busy: boolean): void;
}

/** The file's summary, then merge or (after a second step) replace. Mounted only while open. */
export function ImportDialog({
  raw,
  preview,
  localReports,
  localAttachments,
  onImported,
  onCancel,
  onBusyChange,
}: Props) {
  const { backup } = useServices();
  const [step, setStep] = useState<'choose' | 'confirm-replace'>('choose');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  // A ref, so a second click is ignored even before the busy state has re-rendered.
  const running = useRef(false);

  // An import already running cannot be called off: closing now would hide that data changed.
  function close() {
    if (!running.current) onCancel();
  }
  const { ref, onKeyDown } = useModalFocus<HTMLDivElement>(close);
  const cancel = useRef<HTMLButtonElement>(null);

  // After useModalFocus has captured the opener, so closing returns focus there.
  useEffect(() => {
    cancel.current?.focus();
  }, [step]);

  async function apply(mode: ImportMode) {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    onBusyChange(true);
    setNotice(null);
    try {
      onImported(await backup.applyImport(raw, mode));
    } catch (error) {
      setNotice(importNotice(error));
    } finally {
      running.current = false;
      setBusy(false);
      onBusyChange(false);
    }
  }

  // Buttons stay focusable while busy (aria-disabled, not disabled) so focus is not dropped.
  const busyProps = { 'aria-disabled': busy || undefined };
  const t = it.settings.importDialog;
  const exportedDay = dayOf(preview.exportedAt);
  // Replace clears every table: files kept here are lost unless the file brings its own.
  const dropsFiles = localAttachments > 0 && preview.attachments === 0;
  return (
    <div
      ref={ref}
      role={step === 'choose' ? 'dialog' : 'alertdialog'}
      aria-modal="true"
      aria-labelledby="import-title"
      aria-describedby={
        step === 'choose'
          ? undefined
          : dropsFiles
            ? 'import-replace-body import-replace-files'
            : 'import-replace-body'
      }
      className={styles.dialog}
      onKeyDown={onKeyDown}
    >
      {step === 'choose' ? (
        <>
          <h3 id="import-title">{t.title}</h3>
          <ul>
            {exportedDay && <li>{t.exportedOn(formatDateLong(exportedDay))}</li>}
            <li>{t.counts(preview.reports, preview.measurements)}</li>
            {preview.from && preview.to && (
              <li>{t.period(formatDateLong(preview.from), formatDateLong(preview.to))}</li>
            )}
            {preview.labs.length > 0 && <li>{t.labs(preview.labs.join(', '))}</li>}
            {localReports > 0 && preview.duplicates > 0 && (
              <li>{t.duplicates(preview.duplicates)}</li>
            )}
          </ul>
          {localReports > 0 && <p>{t.mergeHint}</p>}
          <div className={styles.dialogActions}>
            <button
              ref={cancel}
              type="button"
              className={`${shared.secondary} ${styles.busyButton}`}
              {...busyProps}
              onClick={close}
            >
              {t.cancel}
            </button>
            {localReports > 0 && (
              <button
                type="button"
                className={`${shared.secondary} ${styles.busyButton}`}
                {...busyProps}
                onClick={() => {
                  if (!running.current) setStep('confirm-replace');
                }}
              >
                {t.replace}
              </button>
            )}
            <button
              type="button"
              className={`${shared.primary} ${styles.busyButton}`}
              {...busyProps}
              onClick={() => void apply('merge')}
            >
              {localReports > 0 ? t.merge : t.import}
            </button>
          </div>
        </>
      ) : (
        <>
          <h3 id="import-title">{t.replaceTitle}</h3>
          <p id="import-replace-body">{t.replaceBody(localReports)}</p>
          {dropsFiles && <p id="import-replace-files">{t.replaceDropsFiles}</p>}
          <div className={styles.dialogActions}>
            <button
              ref={cancel}
              type="button"
              className={`${shared.secondary} ${styles.busyButton}`}
              {...busyProps}
              onClick={() => {
                if (!running.current) setStep('choose');
              }}
            >
              {t.cancel}
            </button>
            <button
              type="button"
              className={`${shared.primary} ${styles.busyButton}`}
              {...busyProps}
              onClick={() => void apply('replace')}
            >
              {t.replaceConfirm}
            </button>
          </div>
        </>
      )}
      {notice && <ImportNotice notice={notice} />}
    </div>
  );
}
