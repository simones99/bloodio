import { ImportError } from '../../storage/backup/errors';
import { it } from '../i18n/it';
import shared from '../styles/shared.module.css';
import styles from './settings.module.css';

export interface Notice {
  message: string;
  issues: string[];
}

/** What to tell the user about a failed preview or import. */
export function importNotice(error: unknown): Notice {
  const d = it.settings.data;
  if (error instanceof ImportError) {
    return error.code === 'too-new'
      ? { message: d.tooNew, issues: [] }
      : { message: d.invalid, issues: error.issues.slice(0, 5) };
  }
  return { message: d.importFailed, issues: [] };
}

export function ImportNotice({ notice }: { notice: Notice }) {
  return (
    <div className={shared.alert} role="alert">
      <p>{notice.message}</p>
      {notice.issues.length > 0 && (
        <details className={styles.issues}>
          <summary>{it.settings.data.invalidDetails}</summary>
          <ul>
            {notice.issues.map((issue) => (
              <li key={issue}>{issue}</li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
