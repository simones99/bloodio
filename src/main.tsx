import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createPageRenderer } from './ingest/image-pages';
import type { OpenPdf } from './ingest/ingest-file';
import { PREPROCESS_STEPS } from './ingest/preprocess';
import { pickCore } from './ocr/assets';
import { createAppStatus } from './pwa/app-status';
import { createOcrOffline } from './pwa/ocr-offline';
import { registerServiceWorker } from './pwa/register';
import { createLazyBackupService } from './storage/backup/lazy-backup';
import { createCustomAnalyteStore } from './storage/custom-analyte-store';
import { openDb } from './storage/db';
import { createReportRepository } from './storage/report-repository';
import { createSettingsStore } from './storage/settings-store';
import { createStorageStatus } from './storage/storage-status';
import { App } from './ui/App';
import { ServicesProvider, type Services } from './ui/app/services';
import { syncTheme } from './ui/app/theme';
import './ui/styles/global.css';

const root = document.getElementById('root');
if (!root) throw new Error('Missing #root element');

const db = await openDb();
const reports = createReportRepository(db);
const settings = createSettingsStore(db);
// One registration for both: the app's offline status and the OCR download wait for it.
const registered = registerServiceWorker();
// pdf.js is large: it loads only when the user picks a file.
const openPdf: OpenPdf = async (data) => (await import('./ingest/pdf-loader')).openPdf(data);
const services: Services = {
  reports,
  customAnalytes: createCustomAnalyteStore(db),
  settings,
  // zod and the export schema load on first use; an import refreshes every open page.
  backup: createLazyBackupService(db, () => {
    reports.invalidate();
    settings.invalidate();
  }),
  storage: createStorageStatus(navigator.storage),
  app: createAppStatus({
    registered,
    serviceWorker: navigator.serviceWorker,
    matchMedia: typeof matchMedia === 'function' ? (query) => matchMedia(query) : undefined,
    standalone: (navigator as Navigator & { standalone?: boolean }).standalone,
  }),
  // Starts by itself: the OCR files download in the background once the service worker is active.
  ocrOffline: createOcrOffline({
    registered,
    serviceWorker: navigator.serviceWorker,
    caches: typeof caches === 'undefined' ? undefined : caches,
    saveData:
      (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData ===
      true,
    whenIdle: (run) => {
      if (typeof requestIdleCallback === 'function') {
        requestIdleCallback(() => run(), { timeout: 10_000 });
      } else {
        setTimeout(run, 2_000);
      }
    },
    pickCore,
    baseURI: document.baseURI,
  }),
  // The router lives in the hash: dropping it lands on the start page.
  restart: () => location.replace(location.pathname),
  openPdf,
  // tesseract.js and its worker load only when a scan or a photo is chosen.
  ocr: async () => (await import('./ocr/tesseract-engine')).createTesseractEngine(),
  pages: createPageRenderer(PREPROCESS_STEPS, openPdf),
};

// Before the first render, so the page never flashes the wrong theme.
await syncTheme(settings);

createRoot(root).render(
  <StrictMode>
    <ServicesProvider services={services}>
      <App />
    </ServicesProvider>
  </StrictMode>,
);
