import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
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
  // The router lives in the hash: dropping it lands on the start page.
  restart: () => location.replace(location.pathname),
  // pdf.js is large: it loads only when the user picks a file.
  openPdf: async (data) => (await import('./ingest/pdf-loader')).openPdf(data),
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
