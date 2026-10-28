import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createBackupService,
  ImportError,
  type BackupService,
} from '../../src/storage/backup/backup-service';
import { arrayBufferToBase64, base64ToArrayBuffer } from '../../src/storage/backup/base64';
import { EXPORT_VERSION } from '../../src/storage/backup/schema';
import { APP_VERSION } from '../../src/version';
import { createCustomAnalyteStore } from '../../src/storage/custom-analyte-store';
import { DEFAULT_PROFILE_ID, type BloodioDb } from '../../src/storage/db';
import { createReportRepository } from '../../src/storage/report-repository';
import { freshDb, measurementInput, reportInput } from './helpers';

let db: BloodioDb;
let backup: BackupService;

async function seed(target: BloodioDb) {
  const repo = createReportRepository(target);
  const custom = await createCustomAnalyteStore(target).create({
    name: 'Cristalli rari',
    unit: null,
    category: 'urine',
    specimen: 'urine',
    kind: 'qualitative',
  });
  await repo.saveReport(reportInput({ sampleDate: '2021-07-10' }), [
    measurementInput({ value: 5.48, valueText: '5,48' }),
  ]);
  await repo.saveReport(
    reportInput({ sampleDate: '2021-10-04', type: 'misto', fileHash: 'hash-1' }),
    [
      measurementInput({ value: 5.31, valueText: '5,31' }),
      measurementInput({
        analyteId: null,
        customAnalyteId: custom.id,
        value: null,
        valueText: 'Rari',
        unit: null,
        refMin: null,
        refMax: null,
        refText: null,
      }),
    ],
    [
      {
        data: new Uint8Array([9, 8, 7]).buffer,
        mimeType: 'application/pdf',
        fileName: 'referto.pdf',
      },
    ],
  );
  await target.settings.put({ key: 'preferredUnits', value: { glucose: 'mmol/L' } });
  return custom;
}

const snapshot = async (target: BloodioDb) => ({
  profiles: await target.profiles.toArray(),
  reports: await target.reports.orderBy('id').toArray(),
  measurements: await target.measurements.orderBy('id').toArray(),
  customAnalytes: await target.customAnalytes.toArray(),
});

beforeEach(async () => {
  db = await freshDb();
  backup = createBackupService(db);
});

describe('base64', () => {
  it('round-trips binary data', () => {
    const bytes = new Uint8Array(70000).map((_, i) => i % 251);
    const back = new Uint8Array(base64ToArrayBuffer(arrayBufferToBase64(bytes.buffer)));
    expect(back).toEqual(bytes);
  });
});

describe('exportAll', () => {
  it('writes the versioned envelope and leaves recording the export to the caller', async () => {
    await seed(db);
    const file = await backup.exportAll();
    expect(file).toMatchObject({
      app: 'bloodio',
      version: EXPORT_VERSION,
      appVersion: APP_VERSION,
    });
    expect(file.data.reports).toHaveLength(2);
    expect(file.data.measurements).toHaveLength(3);
    expect(file.data.preferredUnits).toEqual({ glucose: 'mmol/L' });
    expect(file.data.unitSystem).toBe('printed');
    expect(file.data.attachments).toEqual([]);
    expect(await db.settings.get('lastExportAt')).toBeUndefined();
  });

  it('writes "printed" when the stored unit system is not a known one', async () => {
    await db.settings.put({ key: 'unitSystem', value: 'imperial' });
    expect((await backup.exportAll()).data.unitSystem).toBe('printed');
    await db.settings.put({ key: 'unitSystem', value: 'si' });
    expect((await backup.exportAll()).data.unitSystem).toBe('si');
  });

  it('includes attachments only on request', async () => {
    await seed(db);
    const file = await backup.exportAll({ includeAttachments: true });
    expect(file.data.attachments).toHaveLength(1);
    expect(file.data.attachments[0]).toMatchObject({ fileName: 'referto.pdf', base64: 'CQgH' });
  });
});

describe('round trip', () => {
  it('export -> wipe -> import(replace) restores identical data', async () => {
    await seed(db);
    const before = await snapshot(db);
    const json = JSON.parse(
      JSON.stringify(await backup.exportAll({ includeAttachments: true })),
    ) as unknown;

    await backup.wipeAll();
    expect(await db.reports.count()).toBe(0);
    expect((await db.profiles.toArray()).map((p) => p.id)).toEqual([DEFAULT_PROFILE_ID]);

    expect(await backup.applyImport(json, 'replace')).toEqual({ added: 2, skipped: 0 });
    expect(await snapshot(db)).toEqual(before);
    const attachment = await db.attachments.toArray();
    expect(attachment).toHaveLength(1);
    expect(new Uint8Array(attachment[0]!.data)).toEqual(new Uint8Array([9, 8, 7]));
    expect((await db.settings.get('preferredUnits'))?.value).toEqual({ glucose: 'mmol/L' });
  });
});

describe('previewImport', () => {
  it('summarises the file and counts duplicates', async () => {
    await seed(db);
    const json = JSON.parse(JSON.stringify(await backup.exportAll())) as unknown;
    expect(await backup.previewImport(json)).toMatchObject({
      version: 1,
      reports: 2,
      measurements: 3,
      from: '2021-07-10',
      to: '2021-10-04',
      labs: ['PROAVIS'],
      duplicates: 2,
    });
    const empty = await freshDb();
    expect((await createBackupService(empty).previewImport(json)).duplicates).toBe(0);
  });

  it('counts the original files the file carries', async () => {
    await seed(db);
    const without = JSON.parse(JSON.stringify(await backup.exportAll())) as unknown;
    expect((await backup.previewImport(without)).attachments).toBe(0);
    const withFiles = JSON.parse(
      JSON.stringify(await backup.exportAll({ includeAttachments: true })),
    ) as unknown;
    expect((await backup.previewImport(withFiles)).attachments).toBe(1);
  });

  it('rejects files from a newer app', async () => {
    const error = await backup
      .previewImport({ app: 'bloodio', version: 99 })
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ImportError);
    expect((error as ImportError).code).toBe('too-new');
  });

  it('rejects malformed files with readable issues', async () => {
    const error = await backup
      .previewImport({
        app: 'bloodio',
        version: 1,
        exportedAt: 'x',
        appVersion: 'x',
        data: { reports: [{ id: 1 }] },
      })
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ImportError);
    expect((error as ImportError).code).toBe('invalid');
    expect((error as ImportError).issues.some((i) => i.startsWith('data.reports.0.id'))).toBe(true);
    await expect(backup.previewImport('not json')).rejects.toBeInstanceOf(ImportError);
  });
});

describe('applyImport merge', () => {
  it('skips duplicates, keeps existing data, and remaps custom analytes by name', async () => {
    // Device A exports; device B already has the May report and its own "cristalli rari".
    const deviceA = await freshDb();
    const customA = await seed(deviceA);
    const json = JSON.parse(
      JSON.stringify(await createBackupService(deviceA).exportAll()),
    ) as unknown;

    const customB = await createCustomAnalyteStore(db).create({
      name: 'cristalli RARI',
      unit: null,
      category: 'urine',
      specimen: 'urine',
      kind: 'qualitative',
    });
    const keptId = await createReportRepository(db).saveReport(
      reportInput({ sampleDate: '2021-07-10', lab: ' proavis ' }),
      [measurementInput({ value: 9.99, valueText: '9,99' })],
    );

    expect(await backup.applyImport(json, 'merge')).toEqual({ added: 1, skipped: 1 });
    expect(await db.reports.count()).toBe(2);
    expect((await createReportRepository(db).getReport(keptId))?.measurements[0]?.value).toBe(9.99);
    expect(await db.customAnalytes.count()).toBe(1);
    expect(customA.id).not.toBe(customB.id);
    expect(await db.measurements.where('customAnalyteId').equals(customB.id).count()).toBe(1);
    expect(await db.measurements.where('customAnalyteId').equals(customA.id).count()).toBe(0);
  });

  it('treats the same file hash as a duplicate even with another date', async () => {
    const deviceA = await freshDb();
    await seed(deviceA);
    const json = JSON.parse(
      JSON.stringify(await createBackupService(deviceA).exportAll()),
    ) as unknown;
    await createReportRepository(db).saveReport(
      reportInput({ sampleDate: '2020-01-01', fileHash: 'hash-1' }),
      [],
    );
    expect(await backup.applyImport(json, 'merge')).toEqual({ added: 1, skipped: 1 });
  });
});

describe('applyImport replace', () => {
  it('changes nothing when the import fails half way', async () => {
    await seed(db);
    const before = await snapshot(db);
    const file = await backup.exportAll();
    const json = JSON.parse(JSON.stringify(file)) as unknown;
    vi.spyOn(db.measurements, 'bulkAdd').mockRejectedValueOnce(new Error('boom'));
    await expect(backup.applyImport(json, 'replace')).rejects.toThrow('boom');
    expect(await snapshot(db)).toEqual(before);
  });

  it('rejects a file with two reports sharing an id, before writing anything', async () => {
    await seed(db);
    const before = await snapshot(db);
    const file = await backup.exportAll();
    const broken = JSON.parse(JSON.stringify(file)) as typeof file;
    broken.data.reports.push({ ...broken.data.reports[0]! });
    const error = await backup.applyImport(broken, 'replace').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ImportError);
    expect((error as ImportError).code).toBe('invalid');
    expect(
      (error as ImportError).issues.some((i) =>
        i.includes(`id duplicato ${broken.data.reports[0]!.id}`),
      ),
    ).toBe(true);
    expect(await snapshot(db)).toEqual(before);
  });

  it('rejects a file with two measurements sharing an id', async () => {
    await seed(db);
    const file = await backup.exportAll();
    const broken = JSON.parse(JSON.stringify(file)) as typeof file;
    broken.data.measurements.push({ ...broken.data.measurements[0]! });
    const error = await backup.applyImport(broken, 'replace').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ImportError);
    expect((error as ImportError).code).toBe('invalid');
  });

  it('rejects a file with two custom analytes sharing an id', async () => {
    const custom = await seed(db);
    const file = await backup.exportAll();
    const broken = JSON.parse(JSON.stringify(file)) as typeof file;
    broken.data.customAnalytes.push({
      ...broken.data.customAnalytes.find((c) => c.id === custom.id)!,
    });
    const error = await backup.applyImport(broken, 'replace').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ImportError);
    expect((error as ImportError).code).toBe('invalid');
  });
});

describe('previewImport: in-file duplicates', () => {
  it('counts two file reports that share a non-null file hash as a duplicate', async () => {
    const deviceA = await freshDb();
    await seed(deviceA);
    const file = await createBackupService(deviceA).exportAll();
    const withDuplicate = JSON.parse(JSON.stringify(file)) as typeof file;
    const hashed = withDuplicate.data.reports.find((r) => r.fileHash === 'hash-1')!;
    withDuplicate.data.reports.push({
      ...hashed,
      id: crypto.randomUUID(),
      sampleDate: '2099-01-01',
    });
    const empty = await freshDb();
    const preview = await createBackupService(empty).previewImport(withDuplicate);
    expect(preview.duplicates).toBe(1);
  });
});

describe('applyImport merge: in-file duplicates', () => {
  it('skips the later of two file reports sharing a file hash', async () => {
    const deviceA = await freshDb();
    await seed(deviceA);
    const file = await createBackupService(deviceA).exportAll();
    const withDuplicate = JSON.parse(JSON.stringify(file)) as typeof file;
    const hashed = withDuplicate.data.reports.find((r) => r.fileHash === 'hash-1')!;
    withDuplicate.data.reports.push({
      ...hashed,
      id: crypto.randomUUID(),
      sampleDate: '2099-01-01',
    });
    const result = await backup.applyImport(withDuplicate, 'merge');
    expect(result.skipped).toBeGreaterThanOrEqual(1);
    expect(await db.reports.where('fileHash').equals('hash-1').count()).toBe(1);
  });
});

describe('frozen export formats', () => {
  it('still imports the version 1 fixture', async () => {
    const json = JSON.parse(readFileSync('tests/fixtures/export-v1.json', 'utf8')) as unknown;
    expect(await backup.previewImport(json)).toMatchObject({
      version: 1,
      reports: 2,
      measurements: 3,
    });
    expect(await backup.applyImport(json, 'replace')).toEqual({ added: 2, skipped: 0 });
    expect(await db.settings.get('unitSystem')).toBeUndefined();
    const tsh = await createReportRepository(db).listSeries({ kind: 'catalog', id: 'tsh' });
    expect(tsh.map((p) => p.measurement.value)).toEqual([5.48, 5.31]);
  });
});

describe('unit system', () => {
  it('travels in the file: replace applies it, merge keeps the local one', async () => {
    const deviceA = await freshDb();
    await seed(deviceA);
    await deviceA.settings.put({ key: 'unitSystem', value: 'si' });
    const json = JSON.parse(
      JSON.stringify(await createBackupService(deviceA).exportAll()),
    ) as unknown;

    await db.settings.put({ key: 'unitSystem', value: 'conventional' });
    await backup.applyImport(json, 'merge');
    expect((await db.settings.get('unitSystem'))?.value).toBe('conventional');
    await backup.applyImport(json, 'replace');
    expect((await db.settings.get('unitSystem'))?.value).toBe('si');
  });
});

describe('applyImport merge: safety', () => {
  it('is idempotent: the same file twice adds nothing the second time', async () => {
    const deviceA = await freshDb();
    await seed(deviceA);
    const json = JSON.parse(
      JSON.stringify(await createBackupService(deviceA).exportAll()),
    ) as unknown;
    expect(await backup.applyImport(json, 'merge')).toEqual({ added: 2, skipped: 0 });
    const before = await snapshot(db);
    expect(await backup.applyImport(json, 'merge')).toEqual({ added: 0, skipped: 2 });
    expect(await snapshot(db)).toEqual(before);
  });

  it('changes nothing when a merge fails half way', async () => {
    const deviceA = await freshDb();
    await seed(deviceA);
    const json = JSON.parse(
      JSON.stringify(await createBackupService(deviceA).exportAll()),
    ) as unknown;
    await createReportRepository(db).saveReport(reportInput({ sampleDate: '2024-01-01' }), [
      measurementInput(),
    ]);
    const before = await snapshot(db);
    vi.spyOn(db.measurements, 'bulkAdd').mockRejectedValueOnce(new Error('boom'));
    await expect(backup.applyImport(json, 'merge')).rejects.toThrow('boom');
    expect(await snapshot(db)).toEqual(before);
  });
});

describe('wipeAll', () => {
  it('succeeds once the data are deleted, even if reopening the database fails', async () => {
    await seed(db);
    vi.spyOn(db, 'open').mockRejectedValueOnce(new Error('blocked'));
    await expect(backup.wipeAll()).resolves.toBeUndefined();
    await db.open();
    expect(await db.reports.count()).toBe(0);
  });

  it('rejects when the data could not be deleted', async () => {
    await seed(db);
    vi.spyOn(db, 'delete').mockRejectedValueOnce(new Error('blocked'));
    await expect(backup.wipeAll()).rejects.toThrow('blocked');
    expect(await db.reports.count()).toBe(2);
  });
});
