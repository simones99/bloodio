import type { BloodioDb } from '../db';
import type { BackupService } from './backup-service';

/**
 * The backup service, loaded on first use: zod and the export schema stay out of the start-up
 * bundle. After a successful import it calls `onImported`, so every open page reloads its data.
 */
export function createLazyBackupService(db: BloodioDb, onImported: () => void): BackupService {
  let service: Promise<BackupService> | undefined;
  const load = () =>
    (service ??= import('./backup-service')
      .then((module) => module.createBackupService(db))
      .catch((error: unknown) => {
        service = undefined; // a failed chunk load may succeed on the next try
        throw error;
      }));

  return {
    exportAll: async (options) => (await load()).exportAll(options),
    previewImport: async (raw) => (await load()).previewImport(raw),
    async applyImport(raw, mode) {
      const result = await (await load()).applyImport(raw, mode);
      // The import is committed: a failing refresh must not make the caller report it as failed
      // (or retry it). Pages that missed the signal reload on their next change.
      try {
        onImported();
      } catch {
        // ignored on purpose, see above
      }
      return result;
    },
    wipeAll: async () => (await load()).wipeAll(),
  };
}
