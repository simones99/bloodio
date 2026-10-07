import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createBackupService } from './storage/backup/backup-service';
import { createCustomAnalyteStore } from './storage/custom-analyte-store';
import { openDb } from './storage/db';
import { createReportRepository } from './storage/report-repository';
import { createSettingsStore } from './storage/settings-store';
import { App } from './ui/App';
import { ServicesProvider, type Services } from './ui/app/services';
import './ui/styles/global.css';

const root = document.getElementById('root');
if (!root) throw new Error('Missing #root element');

const db = await openDb();
const services: Services = {
  reports: createReportRepository(db),
  customAnalytes: createCustomAnalyteStore(db),
  settings: createSettingsStore(db),
  backup: createBackupService(db),
  // pdf.js is large: it loads only when the user picks a file.
  openPdf: async (data) => (await import('./ingest/pdf-loader')).openPdf(data),
};

createRoot(root).render(
  <StrictMode>
    <ServicesProvider services={services}>
      <App />
    </ServicesProvider>
  </StrictMode>,
);
