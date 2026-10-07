import { useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import type { Report } from '../../domain/types';
import { IngestError, ingestFile, type IngestedFile } from '../../ingest/ingest-file';
import { parseReport } from '../../parsers/registry';
import type { DraftReport } from '../../parsers/types';
import { useServices } from '../app/services';
import { useImportSession } from '../import/import-session';
import { formatDateLong, it } from '../i18n/it';
import shared from '../styles/shared.module.css';
import styles from './ImportPage.module.css';

type State =
  | { step: 'idle'; error?: string }
  | { step: 'reading' }
  | { step: 'duplicate'; existing: Report; file: IngestedFile; draft: DraftReport };

export function ImportPage() {
  const { openPdf, reports } = useServices();
  const { setSession } = useImportSession();
  const navigate = useNavigate();
  const input = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<State>({ step: 'idle' });

  const proceed = (file: IngestedFile, draft: DraftReport) => {
    setSession({ mode: 'import', file, draft });
    navigate('/import/verify');
  };

  async function onFile(chosen: File | undefined) {
    if (!chosen) return;
    setState({ step: 'reading' });
    try {
      const file = await ingestFile(chosen, openPdf);
      const draft = parseReport(file.text);
      if (draft.rows.length === 0) {
        setState({ step: 'idle', error: it.importer.noRows });
        return;
      }
      const existing = file.fileHash
        ? (await reports.findDuplicates({ fileHash: file.fileHash }))[0]
        : undefined;
      if (existing) setState({ step: 'duplicate', existing, file, draft });
      else proceed(file, draft);
    } catch (error) {
      const message =
        error instanceof IngestError
          ? it.importer.errors[error.code]
          : it.importer.errors.unreadable;
      setState({ step: 'idle', error: message });
    } finally {
      if (input.current) input.current.value = '';
    }
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
          <div className={styles.pick}>
            <input
              ref={input}
              id="report-file"
              type="file"
              accept="application/pdf,.pdf"
              className="visually-hidden"
              disabled={state.step === 'reading'}
              onChange={(event) => void onFile(event.target.files?.[0])}
            />
            <label
              htmlFor="report-file"
              className={`${shared.primary} ${styles.choose}`}
              data-busy={state.step === 'reading' || undefined}
            >
              {state.step === 'reading' ? it.importer.reading : it.importer.choose}
            </label>
            <p role="status" className="visually-hidden">
              {state.step === 'reading' ? it.importer.reading : ''}
            </p>
          </div>
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
