import { createBackupService } from '../../src/storage/backup/backup-service';
import { createCustomAnalyteStore } from '../../src/storage/custom-analyte-store';
import { createReportRepository } from '../../src/storage/report-repository';
import { createSettingsStore } from '../../src/storage/settings-store';
import type { Services } from '../../src/ui/app/services';
import { freshDb } from '../storage/helpers';

/** Real stores on an in-memory IndexedDB: component tests exercise the same code the app runs. */
export async function testServices(): Promise<Services> {
  const db = await freshDb();
  return {
    reports: createReportRepository(db),
    customAnalytes: createCustomAnalyteStore(db),
    settings: createSettingsStore(db),
    backup: createBackupService(db),
    openPdf: () => Promise.reject(new Error('openPdf is not available in component tests')),
  };
}
