import { createContext, useContext, type ReactNode } from 'react';
import type { OpenPdf } from '../../ingest/ingest-file';
import type { BackupService } from '../../storage/backup/backup-service';
import type { CustomAnalyteStore, ReportRepository, SettingsStore } from '../../storage/types';

/** Everything the UI needs from outside React. The UI never imports Dexie or pdf.js directly. */
export interface Services {
  reports: ReportRepository;
  customAnalytes: CustomAnalyteStore;
  settings: SettingsStore;
  backup: BackupService;
  openPdf: OpenPdf;
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
