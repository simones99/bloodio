import { createContext, useContext, type ReactNode } from 'react';
import type { PageRenderer } from '../../ingest/image-pages';
import type { OpenPdf } from '../../ingest/ingest-file';
import type { OcrEngine } from '../../ocr/types';
import type { AppStatus } from '../../pwa/app-status';
import type { OcrOffline } from '../../pwa/ocr-offline';
import type { BackupService } from '../../storage/backup/backup-service';
import type { StorageStatus } from '../../storage/storage-status';
import type { CustomAnalyteStore, ReportRepository, SettingsStore } from '../../storage/types';

/** Everything the UI needs from outside React. The UI never imports Dexie or pdf.js directly. */
export interface Services {
  reports: ReportRepository;
  customAnalytes: CustomAnalyteStore;
  settings: SettingsStore;
  backup: BackupService;
  storage: StorageStatus;
  /** Offline readiness and installation, from the service worker and the display mode. */
  app: AppStatus;
  /** The background download that makes OCR work offline, and its status. */
  ocrOffline: OcrOffline;
  /** Reloads the app from its start page: after "elimina tutto" nothing in memory may survive. */
  restart(): void;
  openPdf: OpenPdf;
  /** Loads the OCR engine; called only when a scan or a photo is chosen. */
  ocr(): Promise<OcrEngine>;
  /** Draws photos and scanned PDF pages for the OCR. */
  pages: PageRenderer;
}

const ServicesContext = createContext<Services | null>(null);

export function ServicesProvider({
  services,
  children,
}: {
  services: Services;
  children: ReactNode;
}) {
  return <ServicesContext.Provider value={services}>{children}</ServicesContext.Provider>;
}

export function useServices(): Services {
  const services = useContext(ServicesContext);
  if (!services) throw new Error('useServices must be used inside ServicesProvider');
  return services;
}
