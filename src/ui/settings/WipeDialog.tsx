import { useCallback, useEffect, useRef, useState } from 'react';
import { useServices } from '../app/services';
import { useModalFocus } from '../app/use-modal-focus';
import { useQuery } from '../app/use-query';
import { it } from '../i18n/it';
import shared from '../styles/shared.module.css';
import { backupState } from '../app/backup-state';
import styles from './settings.module.css';
import type { Exporter } from '../app/use-export';

interface Props {
  exporter: Exporter;
  onClose(): void;
}

/** How long the final button ignores taps after it appears. */
const FINAL_STEP_GUARD_MS = 600;

/**
 * Two steps. The final button ignores taps for a moment after it appears, so a double tap on
 * "Continua" cannot delete. On success the app restarts: the import session, caches and
 * subscribers all go.
 */
export function WipeDialog({ exporter, onClose }: Props) {
  const { reports, settings, backup, restart } = useServices();
  const [step, setStep] = useState<'explain' | 'confirm'>('explain');
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  // A ref, so a second click is ignored even before the busy state has re-rendered.
  const running = useRef(false);

  // A delete already running cannot be called off: closing now would hide what happened.
  function close() {
    if (!running.current) onClose();
  }
  const { ref, onKeyDown } = useModalFocus<HTMLDivElement>(close);
  const cancel = useRef<HTMLButtonElement>(null);

  const loaded = useQuery(
    useCallback(async () => {
      const summaries = await reports.listReportSummaries();
      const state = backupState({
        lastExportAt: await settings.get('lastExportAt'),
        dataChangedAt: await settings.get('dataChangedAt'),
      });
      // A file unread here counts as present: the last export may have left the originals out.
      const files = await reports.attachmentSummary().then(
        (summary) => summary.count,
        () => null,
      );
      return {
        reports: summaries.length,
        values: summaries.reduce((sum, s) => sum + s.total, 0),
        worthSaving: state.pending || files !== 0,
      };
    }, [reports, settings]),
  );

  // When the final step was shown, for the guard against double taps.
  const shownAt = useRef(0);

  // After useModalFocus has captured the opener, so closing returns focus there. At once, not
  // after the counts load: the trigger is hidden by now and focus must not drop to the page.
  useEffect(() => {
    if (step === 'confirm') shownAt.current = Date.now();
    cancel.current?.focus();
  }, [step]);

  async function wipe() {
    if (running.current || Date.now() - shownAt.current < FINAL_STEP_GUARD_MS) return;
    running.current = true;
    setBusy(true);
    setFailed(false);
    try {
      await backup.wipeAll();
      restart();
    } catch {
      running.current = false;
      setFailed(true);
      setBusy(false);
    }
  }

  // Buttons stay focusable while busy (aria-disabled, not disabled) so focus is not dropped.
  const busyProps = { 'aria-disabled': busy || undefined };
  const exportBusyProps = { 'aria-disabled': exporter.busy || undefined };
  const w = it.settings.wipe;
  return (
    // A new element per step, so screen readers announce the new title and body.
    <div
      key={step}
      ref={ref}
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="wipe-title"
      aria-describedby="wipe-body"
      className={styles.dialog}
      onKeyDown={onKeyDown}
    >
      {step === 'explain' ? (
        <>
          <h3 id="wipe-title">{w.title}</h3>
          <p id="wipe-body">
            {loaded.status === 'ready' && w.body(loaded.data.reports, loaded.data.values)}
            {loaded.status === 'error' && w.bodyUnknown}
          </p>
          <div className={styles.dialogActions}>
            <button ref={cancel} type="button" className={shared.secondary} onClick={close}>
              {w.cancel}
            </button>
            {/* Without the counts, assume something is worth saving. */}
            {(loaded.status === 'error' ||
              (loaded.status === 'ready' && loaded.data.worthSaving)) && (
              <button
                type="button"
                className={`${shared.secondary} ${styles.busyButton}`}
                {...exportBusyProps}
                onClick={() => {
                  if (exporter.busy) return;
                  onClose();
                  // The original files are about to go too: keep them in this copy.
                  void exporter.run({ includeAttachments: true });
                }}
              >
                {w.exportFirst}
              </button>
            )}
            {/* Not while an export runs: the file must be read before the data go. */}
            <button
              type="button"
              className={`${shared.secondary} ${styles.busyButton}`}
              {...exportBusyProps}
              onClick={() => {
                if (!exporter.busy) setStep('confirm');
              }}
            >
              {w.continue}
            </button>
          </div>
        </>
      ) : (
        <>
          <h3 id="wipe-title">{w.confirmTitle}</h3>
          <p id="wipe-body">{w.confirmBody}</p>
          <div className={styles.dialogActions}>
            <button
              type="button"
              className={`${shared.primary} ${styles.busyButton}`}
              {...busyProps}
              onClick={() => void wipe()}
            >
              {w.confirm}
            </button>
            <button
              ref={cancel}
              type="button"
              className={`${shared.secondary} ${styles.busyButton}`}
              {...busyProps}
              onClick={close}
            >
              {w.cancel}
            </button>
          </div>
        </>
      )}
      {failed && (
        <p className={shared.alert} role="alert">
          {w.failed}
        </p>
      )}
    </div>
  );
}
