import { normalizeName } from '../../domain/normalize';
import { APP_VERSION } from '../../version';
import { defaultProfile, type AttachmentRecord, type BloodioDb } from '../db';
import { normalizeLab } from '../types';
import { arrayBufferToBase64, base64ToArrayBuffer } from './base64';
import { currentExportFile, EXPORT_VERSION, type ExportFile } from './schema';

export type ImportMode = 'replace' | 'merge';

export interface ExportOptions {
  includeAttachments?: boolean;
}

export interface ImportPreview {
  version: number;
  exportedAt: string;
  reports: number;
  measurements: number;
  /** Earliest and latest sample date, null when the file has no reports. */
  from: string | null;
  to: string | null;
  labs: string[];
  /** Reports of the file that already exist here (relevant for "merge"). */
  duplicates: number;
}

export interface ImportResult {
  added: number;
  skipped: number;
}

export class ImportError extends Error {
  constructor(
    readonly code: 'invalid' | 'too-new',
    readonly issues: string[],
  ) {
    super(code === 'too-new' ? 'Export created by a newer app version' : 'Invalid export file');
    this.name = 'ImportError';
  }
}

export interface BackupService {
  exportAll(options?: ExportOptions): Promise<ExportFile>;
  previewImport(raw: unknown): Promise<ImportPreview>;
  applyImport(raw: unknown, mode: ImportMode): Promise<ImportResult>;
  wipeAll(): Promise<void>;
}

/** upgraders[n] turns a version-n file into version n + 1. Never delete an entry. */
const upgraders: Record<number, (file: unknown) => unknown> = {};

export function parseExportFile(raw: unknown): ExportFile {
  const version = (raw as { version?: unknown } | null)?.version;
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) {
    throw new ImportError('invalid', ['version: numero di versione mancante o non valido']);
  }
  if (version > EXPORT_VERSION) throw new ImportError('too-new', [`version: ${version}`]);

  let file = raw;
  for (let v = version; v < EXPORT_VERSION; v++) {
    const upgrade = upgraders[v];
    if (!upgrade) throw new ImportError('invalid', [`version: nessuna migrazione da ${v}`]);
    file = upgrade(file);
  }

  const parsed = currentExportFile.safeParse(file);
  if (!parsed.success) {
    throw new ImportError(
      'invalid',
      parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`),
    );
  }

  const duplicateIdIssues = [
    ...findDuplicateIds(parsed.data.data.reports, 'data.reports'),
    ...findDuplicateIds(parsed.data.data.measurements, 'data.measurements'),
    ...findDuplicateIds(parsed.data.data.customAnalytes, 'data.customAnalytes'),
  ];
  if (duplicateIdIssues.length > 0) throw new ImportError('invalid', duplicateIdIssues);

  return parsed.data;
}

function findDuplicateIds(items: { id: string }[], label: string): string[] {
  const seen = new Set<string>();
  const issues: string[] = [];
  for (const item of items) {
    if (seen.has(item.id)) issues.push(`${label}: id duplicato ${item.id}`);
    seen.add(item.id);
  }
  return issues;
}

type ReportRow = ExportFile['data']['reports'][number];

function isDuplicate(candidate: ReportRow, existing: ReportRow[]): boolean {
  return existing.some(
    (r) =>
      r.id === candidate.id ||
      (candidate.fileHash !== null && r.fileHash === candidate.fileHash) ||
      (r.profileId === candidate.profileId &&
        r.sampleDate === candidate.sampleDate &&
        normalizeLab(r.lab) === normalizeLab(candidate.lab)),
  );
}

export function createBackupService(db: BloodioDb): BackupService {
  const allTables = [
    db.profiles,
    db.reports,
    db.measurements,
    db.customAnalytes,
    db.attachments,
    db.settings,
  ];

  return {
    async exportAll(options = {}) {
      const exportedAt = new Date().toISOString();
      const attachments = options.includeAttachments
        ? (await db.attachments.toArray()).sort(
            (x, y) => x.reportId.localeCompare(y.reportId) || x.order - y.order,
          )
        : [];
      const preferred = (await db.settings.get('preferredUnits'))?.value;
      const file: ExportFile = {
        app: 'bloodio',
        version: EXPORT_VERSION,
        exportedAt,
        appVersion: APP_VERSION,
        data: {
          profiles: await db.profiles.toArray(),
          reports: await db.reports.orderBy('sampleDate').toArray(),
          measurements: await db.measurements.toArray(),
          customAnalytes: await db.customAnalytes.toArray(),
          preferredUnits: (preferred as Record<string, string> | undefined) ?? {},
          attachments: attachments.map((a) => ({
            reportId: a.reportId,
            mimeType: a.mimeType,
            fileName: a.fileName,
            base64: arrayBufferToBase64(a.data),
          })),
        },
      };
      await db.settings.put({ key: 'lastExportAt', value: exportedAt });
      return file;
    },

    async previewImport(raw) {
      const file = parseExportFile(raw);
      const existing = await db.reports.toArray();
      const dates = file.data.reports.map((r) => r.sampleDate).sort();
      return {
        version: (raw as { version: number }).version,
        exportedAt: file.exportedAt,
        reports: file.data.reports.length,
        measurements: file.data.measurements.length,
        from: dates[0] ?? null,
        to: dates[dates.length - 1] ?? null,
        labs: [...new Set(file.data.reports.map((r) => r.lab))].sort(),
        duplicates: file.data.reports.filter(
          (r, i) => isDuplicate(r, existing) || isDuplicate(r, file.data.reports.slice(0, i)),
        ).length,
      };
    },

    async applyImport(raw, mode) {
      const { data } = parseExportFile(raw);
      // The export lists a report's files in page order; the position is rebuilt here.
      const pagesSeen = new Map<string, number>();
      const attachments: AttachmentRecord[] = data.attachments.map((a) => {
        const buffer = base64ToArrayBuffer(a.base64);
        const order = pagesSeen.get(a.reportId) ?? 0;
        pagesSeen.set(a.reportId, order + 1);
        return {
          id: crypto.randomUUID(),
          reportId: a.reportId,
          order,
          mimeType: a.mimeType,
          fileName: a.fileName,
          data: buffer,
          size: buffer.byteLength,
        };
      });
      const now = new Date().toISOString();

      if (mode === 'replace') {
        await db.transaction('rw', allTables, async () => {
          await Promise.all(
            [db.profiles, db.reports, db.measurements, db.customAnalytes, db.attachments].map((t) =>
              t.clear(),
            ),
          );
          await db.profiles.bulkAdd(data.profiles.length > 0 ? data.profiles : [defaultProfile()]);
          await db.reports.bulkAdd(data.reports);
          await db.measurements.bulkAdd(data.measurements);
          await db.customAnalytes.bulkAdd(data.customAnalytes);
          await db.attachments.bulkAdd(attachments);
          await db.settings.put({ key: 'preferredUnits', value: data.preferredUnits });
          await db.settings.put({ key: 'dataChangedAt', value: now });
        });
        return { added: data.reports.length, skipped: 0 };
      }

      let added = 0;
      let skipped = 0;
      await db.transaction('rw', allTables, async () => {
        // Custom analytes: same id, else same normalized name, else new. Imported ids are remapped.
        const existingCustom = await db.customAnalytes.toArray();
        const remap = new Map<string, string>();
        for (const custom of data.customAnalytes) {
          const same =
            existingCustom.find((c) => c.id === custom.id) ??
            existingCustom.find((c) => normalizeName(c.name) === normalizeName(custom.name));
          if (same) remap.set(custom.id, same.id);
          else {
            await db.customAnalytes.add(custom);
            existingCustom.push(custom);
          }
        }

        const profileIds = new Set((await db.profiles.toArray()).map((p) => p.id));
        for (const p of data.profiles) if (!profileIds.has(p.id)) await db.profiles.add(p);

        const existingReports = await db.reports.toArray();
        for (const report of data.reports) {
          if (isDuplicate(report, existingReports)) {
            skipped++;
            continue;
          }
          await db.reports.add(report);
          existingReports.push(report);
          await db.measurements.bulkAdd(
            data.measurements
              .filter((m) => m.reportId === report.id)
              .map((m) => ({
                ...m,
                customAnalyteId:
                  m.customAnalyteId === null
                    ? null
                    : (remap.get(m.customAnalyteId) ?? m.customAnalyteId),
              })),
          );
          await db.attachments.bulkAdd(attachments.filter((a) => a.reportId === report.id));
          added++;
        }
        if (added > 0) await db.settings.put({ key: 'dataChangedAt', value: now });
      });
      return { added, skipped };
    },

    async wipeAll() {
      await db.delete();
      await db.open(); // recreates the schema and the default profile
    },
  };
}
