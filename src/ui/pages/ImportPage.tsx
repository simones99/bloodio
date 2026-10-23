import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import type { Report } from '../../domain/types';
import { IngestError, ingestFile, isAbortError, type IngestedFile } from '../../ingest/ingest-file';
import type { OcrProgress } from '../../ocr/types';
import { parseReport } from '../../parsers/registry';
import type { DraftReport } from '../../parsers/types';
import { useServices } from '../app/services';
import { useImportSession } from '../import/import-session';
import { formatDateLong, it } from '../i18n/it';
import shared from '../styles/shared.module.css';
import styles from './ImportPage.module.css';

const ACCEPT = 'application/pdf,.pdf,image/png,image/jpeg,image/heic,image/heif,.heic,.heif';

type State =
  | { step: 'idle'; error?: string; cancelled?: boolean }
  /** `ocr` is null until the OCR reports, and stays null for a PDF with text. */
  | { step: 'reading'; ocr: OcrProgress | null }
  | { step: 'duplicate'; existing: Report; file: IngestedFile; draft: DraftReport };

function progressLabel(progress: OcrProgress): string {
  return progress.phase === 'loading'
    ? it.importer.ocrLoading
    : it.importer.ocrPage(progress.page, progress.pages);
}

export function ImportPage() {
  const { openPdf, ocr, pages, reports } = useServices();
  const { setSession } = useImportSession();
  const navigate = useNavigate();
  const input = useRef<HTMLInputElement>(null);
  const cancelButton = useRef<HTMLButtonElement>(null);
  const reading = useRef<AbortController | null>(null);
  const [state, setState] = useState<State>({ step: 'idle' });

  // Leaving the page stops a reading in progress: the OCR worker must not run on in the background.
  useEffect(() => () => reading.current?.abort(), []);

  const cancelled = state.step === 'idle' && state.cancelled === true;
  useEffect(() => {
    if (cancelled) input.current?.focus();
  }, [cancelled]);

  // The file input unmounts when the progress view appears: hand the focus to "Annulla".
  const showProgress = state.step === 'reading' && state.ocr !== null;
  useEffect(() => {
    if (showProgress) cancelButton.current?.focus();
  }, [showProgress]);

  const announcement =
    state.step === 'reading'
      ? state.ocr
        ? progressLabel(state.ocr)
        : it.importer.reading
      : cancelled
        ? it.importer.cancelled
        : '';

  const proceed = (file: IngestedFile, draft: DraftReport) => {
    setSession({ mode: 'import', file, draft });
    navigate('/import/verify');
  };

  async function onFiles(list: FileList | null) {
    const chosen = list ? [...list] : [];
    if (chosen.length === 0) return;
    reading.current?.abort();
    const controller = new AbortController();
    reading.current = controller;
    setState({ step: 'reading', ocr: null });
    try {
      const file = await ingestFile(chosen, {
        openPdf,
        ocr,
        pages,
        signal: controller.signal,
        onProgress: (progress) => {
          if (!controller.signal.aborted) setState({ step: 'reading', ocr: progress });
        },
      });
      // "Annulla" may land after the last page was read: the user still asked to stop.
      if (controller.signal.aborted) return;
      const draft = parseReport(file.text);
      if (draft.rows.length === 0) {
        const error = file.text.source === 'ocr' ? it.importer.noRowsOcr : it.importer.noRows;
        setState({ step: 'idle', error });
        return;
      }
      const existing = file.fileHash
        ? (await reports.findDuplicates({ fileHash: file.fileHash }))[0]
        : undefined;
      // "Annulla" or leaving the page may land while the duplicate check runs.
      if (controller.signal.aborted) return;
      if (existing) setState({ step: 'duplicate', existing, file, draft });
      else proceed(file, draft);
    } catch (error) {
      // "Annulla" has already reset the page, and a page left behind has nothing to show.
      if (isAbortError(error) || controller.signal.aborted) return;
      const message =
        error instanceof IngestError
          ? it.importer.errors[error.code]
          : it.importer.errors.unreadable;
      setState({ step: 'idle', error: message });
    } finally {
      if (reading.current === controller) reading.current = null;
      if (input.current) input.current.value = '';
    }
  }

  function cancel() {
    reading.current?.abort();
    setState({ step: 'idle', cancelled: true });
  }

  return (
    <>
      <header className={shared.pageHead}>
        <h1 className={`display ${shared.pageTitle}`}>{it.importer.title}</h1>
        <p className={shared.lead}>{it.importer.lead}</p>
      </header>

      {state.step === 'duplicate' ? (
        <div className={shared.alert} role="alert">
          <p className={styles.alertTitle}>{it.importer.duplicateTitle}</p>
          <p>{it.importer.duplicateBody(formatDateLong(state.existing.sampleDate))}</p>
          <div className={styles.actions}>
            <Link
              to={`/reports/${state.existing.id}`}
              className={`${shared.secondary} ${styles.link}`}
            >
              {it.importer.openExisting}
            </Link>
            <button
              type="button"
              className={shared.textButton}
              onClick={() => proceed(state.file, state.draft)}
            >
              {it.importer.continueAnyway}
            </button>
          </div>
        </div>
      ) : (
        <>
          {state.step === 'reading' && state.ocr ? (
            <div className={styles.progress}>
              {/* Visible label only: the live region below announces it, once per phase or page. */}
              <p id="ocr-progress" className={styles.progressLabel}>
                {progressLabel(state.ocr)}
              </p>
              <progress
                aria-labelledby="ocr-progress"
                className={styles.bar}
                max={1}
                // No value while loading: the bar stays indeterminate until a page is being read.
                value={state.ocr.phase === 'recognizing' ? state.ocr.fraction : undefined}
              />
              <button
                ref={cancelButton}
                type="button"
                className={shared.secondary}
                onClick={cancel}
              >
                {it.importer.cancel}
              </button>
            </div>
          ) : (
            <div className={styles.pick}>
              <input
                ref={input}
                id="report-file"
                type="file"
                multiple
                accept={ACCEPT}
                className="visually-hidden"
                disabled={state.step === 'reading'}
                onChange={(event) => void onFiles(event.target.files)}
              />
              <label
                htmlFor="report-file"
                className={`${shared.primary} ${styles.choose}`}
                data-busy={state.step === 'reading' || undefined}
              >
                {state.step === 'reading' ? it.importer.reading : it.importer.choose}
              </label>
            </div>
          )}
          {/* One live region, always mounted across the views: only its text changes. */}
          <p role="status" className={cancelled ? styles.note : 'visually-hidden'}>
            {announcement}
          </p>
          {state.step === 'idle' && (
            <div className={styles.manualAction}>
              <button
                type="button"
                className={shared.secondary}
                onClick={() => {
                  setSession({ mode: 'manual' });
                  navigate('/import/verify');
                }}
              >
                {it.importer.manual}
              </button>
            </div>
          )}
        </>
      )}

      {state.step === 'idle' && state.error && (
        <p className={shared.alert} role="alert">
          {state.error}
        </p>
      )}
    </>
  );
}
