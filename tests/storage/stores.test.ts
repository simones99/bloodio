import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createCustomAnalyteStore } from '../../src/storage/custom-analyte-store';
import type { BloodioDb } from '../../src/storage/db';
import { createReportRepository } from '../../src/storage/report-repository';
import { createSettingsStore } from '../../src/storage/settings-store';
import { freshDb, measurementInput, reportInput } from './helpers';

let db: BloodioDb;

beforeEach(async () => {
  db = await freshDb();
});

describe('CustomAnalyteStore', () => {
  const input = {
    name: '  Cristalli rari ',
    unit: null,
    category: 'urine',
    specimen: 'urine',
    kind: 'qualitative',
  } as const;

  it('creates with a trimmed name and lists alphabetically', async () => {
    const store = createCustomAnalyteStore(db);
    const created = await store.create(input);
    await store.create({ ...input, name: 'Albumina urinaria' });
    expect(created.name).toBe('Cristalli rari');
    expect((await store.list()).map((a) => a.name)).toEqual([
      'Albumina urinaria',
      'Cristalli rari',
    ]);
  });

  it('renames without touching the id measurements point to', async () => {
    const store = createCustomAnalyteStore(db);
    const created = await store.create(input);
    await store.rename(created.id, 'Cristalli');
    expect(await store.list()).toEqual([{ ...created, name: 'Cristalli' }]);
    await expect(store.rename('missing', 'x')).rejects.toThrow('not found');
    await expect(store.rename(created.id, '  ')).rejects.toThrow('empty');
  });

  it('refuses to remove an analyte that has measurements', async () => {
    const store = createCustomAnalyteStore(db);
    const created = await store.create(input);
    await createReportRepository(db).saveReport(reportInput(), [
      measurementInput({
        analyteId: null,
        customAnalyteId: created.id,
        value: null,
        valueText: 'Rari',
      }),
    ]);
    await expect(store.remove(created.id)).rejects.toThrow('still has 1 measurements');
    expect(await store.list()).toHaveLength(1);
  });

  it('removes an unused analyte', async () => {
    const store = createCustomAnalyteStore(db);
    const created = await store.create(input);
    await store.remove(created.id);
    expect(await store.list()).toEqual([]);
  });
});

describe('SettingsStore', () => {
  it('returns defaults until a value is set', async () => {
    const store = createSettingsStore(db);
    expect(await store.get('theme')).toBe('nero');
    expect(await store.get('keepOriginalFile')).toBe(false);
    expect(await store.get('preferredUnits')).toEqual({});
  });

  it('persists values and notifies subscribers', async () => {
    const store = createSettingsStore(db);
    const listener = vi.fn();
    store.subscribe(listener);
    await store.set('theme', 'carta');
    await store.set('preferredUnits', { glucose: 'mmol/L' });
    expect(await createSettingsStore(db).get('theme')).toBe('carta');
    expect(await store.get('preferredUnits')).toEqual({ glucose: 'mmol/L' });
    expect(listener).toHaveBeenCalledTimes(2);
  });
});
