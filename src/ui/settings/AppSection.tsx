import { useEffect, useRef, useState } from 'react';
import type { OfflineStatus } from '../../pwa/app-status';
import type { OcrOfflineStatus } from '../../pwa/ocr-offline';
import { useServices } from '../app/services';
import { formatBytes, it } from '../i18n/it';
import shared from '../styles/shared.module.css';
import styles from './settings.module.css';

/**
 * Whether Bloodio and its OCR work offline, and how to install it. Hidden when there is nothing to
 * say.
 */
export function AppSection() {
  const { app, ocrOffline } = useServices();
  const [offline, setOffline] = useState<OfflineStatus>('unsupported');
  const [ocr, setOcr] = useState<OcrOfflineStatus>('unsupported');
  const ocrStatus = useRef<HTMLParagraphElement>(null);
  const downloadAsked = useRef(false);
  useEffect(() => app.watchOffline(setOffline), [app]);
  useEffect(() => ocrOffline.watch(setOcr), [ocrOffline]);
  // The download button goes away once the status changes: hand focus to the new text.
  useEffect(() => {
    if (downloadAsked.current && ocr !== 'paused') {
      downloadAsked.current = false;
      ocrStatus.current?.focus();
    }
  }, [ocr]);

  const installed = app.installed();
  if (offline === 'unsupported' && ocr === 'unsupported' && installed) return null;

  const a = it.settings.app;
  const ocrText = { downloading: a.ocrDownloading, ready: a.ocrReady, paused: a.ocrPaused };
  return (
    <section className={styles.section} aria-labelledby="settings-app">
      <h2 id="settings-app" className={shared.sectionTitle}>
        {a.title}
      </h2>
      <div className={styles.body}>
        {offline !== 'unsupported' && (
          <p className={styles.status} role="status">
            {offline === 'ready' ? a.offlineReady : a.offlinePreparing}
          </p>
        )}
        {ocr !== 'unsupported' && (
          <p className={styles.status} role="status" tabIndex={-1} ref={ocrStatus}>
            {ocrText[ocr]}
          </p>
        )}
        {ocr === 'paused' && (
          <button
            type="button"
            className={shared.secondary}
            onClick={() => {
              downloadAsked.current = true;
              ocrOffline.download();
            }}
          >
            {a.ocrDownload(formatBytes(ocrOffline.size()))}
          </button>
        )}
        {!installed && <p className={styles.status}>{a.install}</p>}
      </div>
    </section>
  );
}
