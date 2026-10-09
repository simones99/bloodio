import { useCallback, useEffect, useRef, useState } from 'react';
import { useServices } from '../app/services';
import { useQuery } from '../app/use-query';
import { formatBytes, it } from '../i18n/it';
import shared from '../styles/shared.module.css';
import styles from './settings.module.css';

/** Whether the browser may evict the data, and how much space they take. Hidden when unknown. */
export function StorageSection() {
  const { storage } = useServices();
  const loaded = useQuery(useCallback(() => storage.get(), [storage]));
  const [granted, setGranted] = useState(false);
  const status = useRef<HTMLParagraphElement>(null);

  // The protect button disappears once the browser agrees: hand focus to the new status.
  useEffect(() => {
    if (granted) status.current?.focus();
  }, [granted]);

  if (loaded.status !== 'ready') return null;

  const persisted = granted || loaded.data.persisted;
  const { usage } = loaded.data;
  if (persisted === null && usage === null) return null;

  const s = it.settings.storage;
  return (
    <section className={styles.section} aria-labelledby="settings-storage">
      <h2 id="settings-storage" className={shared.sectionTitle}>
        {s.title}
      </h2>
      <div className={styles.body}>
        {persisted !== null && (
          <p className={styles.status} role="status" tabIndex={-1} ref={status}>
            {persisted ? s.persisted : s.notPersisted}
          </p>
        )}
        {persisted === false && (
          <button
            type="button"
            className={shared.secondary}
            onClick={async () => setGranted(await storage.requestPersist())}
          >
            {s.protect}
          </button>
        )}
        {usage !== null && <p className={styles.status}>{s.usage(formatBytes(usage))}</p>}
      </div>
    </section>
  );
}
