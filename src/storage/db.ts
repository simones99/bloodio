import Dexie, { type Table } from 'dexie';
import type { CustomAnalyte, Measurement, Report } from '../domain/types';

export const DEFAULT_PROFILE_ID = 'default';

export interface ProfileRecord {
  id: string;
  name: string;
  createdAt: string;
}

/** The original file, stored only when the user enables "conserva file originale". */
export interface AttachmentRecord {
  id: string;
  reportId: string;
  /** Page order inside the report: a photographed report is one file per page. */
  order: number;
  /** ArrayBuffer rather than Blob: cloneable everywhere and free of WebKit's IndexedDB Blob issues. */
  data: ArrayBuffer;
  mimeType: string;
  fileName: string;
  size: number;
}

export interface SettingRecord {
  key: string;
  value: unknown;
}

export class BloodioDb extends Dexie {
  profiles!: Table<ProfileRecord, string>;
  reports!: Table<Report, string>;
  measurements!: Table<Measurement, string>;
  customAnalytes!: Table<CustomAnalyte, string>;
  attachments!: Table<AttachmentRecord, string>;
  settings!: Table<SettingRecord, string>;

  constructor(name = 'bloodio') {
    super(name);
    // Schema changes: add this.version(n + 1) with an upgrade() in src/storage/migrations/,
    // bump EXPORT_VERSION, and keep importing every older export (see ADR 0002).
    this.version(1).stores({
      profiles: 'id',
      reports: 'id, profileId, sampleDate, lab, type, fileHash',
      measurements: 'id, reportId, analyteId, customAnalyteId',
      customAnalytes: 'id, name',
      attachments: 'id, reportId',
      settings: 'key',
    });
    this.on('populate', (tx) => {
      void tx.table('profiles').add(defaultProfile());
    });
  }
}

export function defaultProfile(): ProfileRecord {
  return { id: DEFAULT_PROFILE_ID, name: 'Profilo', createdAt: new Date().toISOString() };
}

export async function openDb(name?: string): Promise<BloodioDb> {
  const db = new BloodioDb(name);
  await db.open();
  return db;
}
