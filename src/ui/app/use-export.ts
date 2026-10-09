import { useCallback, useRef, useState } from 'react';
import type { ExportOptions } from '../../storage/backup/backup-service';
import { useServices } from './services';
import { it } from '../i18n/it';
import { deliverFile } from '../share/deliver-file';
import { exportFileName } from './backup-state';

export interface Exporter {
  busy: boolean;
  failed: boolean;
  run(options: ExportOptions): Promise<void>;
}

/** Exports, hands the file over, and records the export only once the user received the file. */
export function useExport(): Exporter {
  const { backup, settings } = useServices();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  // A ref, so a second click is ignored even before the busy state has re-rendered.
  const running = useRef(false);

  const run = useCallback(
    async (options: ExportOptions) => {
      if (running.current) return;
      running.current = true;
      setBusy(true);
      setFailed(false);
      try {
        let file;
        let outcome;
        try {
          file = await backup.exportAll(options);
          const blob = new Blob([JSON.stringify(file)], { type: 'application/json' });
          outcome = await deliverFile(blob, exportFileName(new Date(file.exportedAt)), it.appName);
        } catch {
          setFailed(true);
          return;
        }
        // A dismissed share sheet is not a backup.
        if (outcome === 'cancelled') return;
        try {
          await settings.set('lastExportAt', file.exportedAt);
        } catch {
          // The user has the file; failing to remember the date is not a failed export.
        }
      } finally {
        running.current = false;
        setBusy(false);
      }
    },
    [backup, settings],
  );

  return { busy, failed, run };
}
