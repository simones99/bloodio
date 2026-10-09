import { describe, expect, it, vi } from 'vitest';
import { createBackupService } from '../../src/storage/backup/backup-service';
import { createLazyBackupService } from '../../src/storage/backup/lazy-backup';
import { createReportRepository } from '../../src/storage/report-repository';
import { freshDb, measurementInput, reportInput } from './helpers';

describe('createLazyBackupService', () => {
  it('behaves like the backup service and signals a successful import', async () => {
    const source = await freshDb();
    await createReportRepository(source).saveReport(reportInput(), [measurementInput()]);
    const json = JSON.parse(
      JSON.stringify(await createBackupService(source).exportAll()),
    ) as unknown;

    const onImported = vi.fn();
    const lazy = createLazyBackupService(await freshDb(), onImported);
    expect((await lazy.previewImport(json)).reports).toBe(1);
    expect(onImported).not.toHaveBeenCalled();
    expect(await lazy.applyImport(json, 'merge')).toEqual({ added: 1, skipped: 0 });
    expect(onImported).toHaveBeenCalledTimes(1);
  });

  it('reports a committed import as done even if the listener throws', async () => {
    const source = await freshDb();
    await createReportRepository(source).saveReport(reportInput(), [measurementInput()]);
    const json = JSON.parse(
      JSON.stringify(await createBackupService(source).exportAll()),
    ) as unknown;
    const onImported = vi.fn(() => {
      throw new Error('listener failed');
    });
    const lazy = createLazyBackupService(await freshDb(), onImported);
    expect(await lazy.applyImport(json, 'merge')).toEqual({ added: 1, skipped: 0 });
    expect(onImported).toHaveBeenCalledTimes(1);
  });

  it('does not signal a failed import', async () => {
    const onImported = vi.fn();
    const lazy = createLazyBackupService(await freshDb(), onImported);
    await expect(lazy.applyImport({ app: 'bloodio', version: 99 }, 'merge')).rejects.toThrow();
    expect(onImported).not.toHaveBeenCalled();
  });
});
