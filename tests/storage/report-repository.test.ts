import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_PROFILE_ID, type BloodioDb } from '../../src/storage/db';
import { createReportRepository } from '../../src/storage/report-repository';
import type { ReportRepository } from '../../src/storage/types';
import { freshDb, measurementInput, reportInput } from './helpers';

let db: BloodioDb;
let repo: ReportRepository;

beforeEach(async () => {
  db = await freshDb();
  repo = createReportRepository(db);
});

describe('database', () => {
  it('creates the default profile on first open', async () => {
    expect((await db.profiles.toArray()).map((p) => p.id)).toEqual([DEFAULT_PROFILE_ID]);
  });
});

describe('saveReport', () => {
  it('stores the report with its measurements and computes outOfRange', async () => {
    const id = await repo.saveReport(reportInput(), [
      measurementInput(),
      measurementInput({
        analyteId: 'ft4',
        value: 1.4,
        valueText: '1,40',
        unit: 'ng/dL',
        refMin: 0.93,
        refMax: 1.7,
      }),
    ]);
    const saved = await repo.getReport(id);
    expect(saved?.report).toMatchObject({ id, profileId: DEFAULT_PROFILE_ID, lab: 'PROAVIS' });
    expect(saved?.report.createdAt).toBe(saved?.report.updatedAt);
    expect(saved?.measurements.map((m) => [m.analyteId, m.order, m.outOfRange])).toEqual([
      ['tsh', 0, true],
      ['ft4', 1, false],
    ]);
  });

  it('stores the original files in page order, only when given', async () => {
    const page = (byte: number, fileName: string) => ({
      data: new Uint8Array([byte, byte, byte]).buffer,
      mimeType: 'image/jpeg',
      fileName,
    });
    const withFiles = await repo.saveReport(
      reportInput(),
      [],
      [page(1, 'pagina-1.jpg'), page(2, 'pagina-2.jpg')],
    );
    const without = await repo.saveReport(reportInput({ sampleDate: '2021-10-04' }), []);
    const stored = await db.attachments.where('reportId').equals(withFiles).sortBy('order');
    expect(stored.map((a) => [a.order, a.fileName, a.size])).toEqual([
      [0, 'pagina-1.jpg', 3],
      [1, 'pagina-2.jpg', 3],
    ]);
    expect(await db.attachments.where('reportId').equals(without).count()).toBe(0);
  });

  it('is atomic: a failing measurement leaves nothing behind', async () => {
    const spy = vi.spyOn(db.measurements, 'bulkAdd').mockRejectedValueOnce(new Error('boom'));
    await expect(repo.saveReport(reportInput(), [measurementInput()])).rejects.toThrow('boom');
    spy.mockRestore();
    expect(await db.reports.count()).toBe(0);
    expect(await db.measurements.count()).toBe(0);
  });

  it('notifies subscribers and records the change time', async () => {
    const listener = vi.fn();
    const unsubscribe = repo.subscribe(listener);
    await repo.saveReport(reportInput(), []);
    expect(listener).toHaveBeenCalledTimes(1);
    expect((await db.settings.get('dataChangedAt'))?.value).toEqual(expect.any(String));
    unsubscribe();
    await repo.saveReport(reportInput(), []);
    expect(listener).toHaveBeenCalledTimes(1);
  });
});

describe('updateReport and deleteReport', () => {
  it('replaces the measurements and keeps createdAt', async () => {
    const id = await repo.saveReport(reportInput(), [measurementInput()]);
    const before = await repo.getReport(id);
    await repo.updateReport(id, reportInput({ notes: 'corretto' }), [
      measurementInput({ value: 3.1, valueText: '3,1' }),
    ]);
    const after = await repo.getReport(id);
    expect(after?.report.notes).toBe('corretto');
    expect(after?.report.createdAt).toBe(before?.report.createdAt);
    expect(after?.measurements).toHaveLength(1);
    expect(after?.measurements[0]).toMatchObject({ value: 3.1, outOfRange: false });
  });

  it('rejects an unknown report', async () => {
    await expect(repo.updateReport('missing', reportInput(), [])).rejects.toThrow(
      'Report not found',
    );
  });

  it('keeps an existing measurement id when the edit only changes its value', async () => {
    const id = await repo.saveReport(reportInput(), [measurementInput()]);
    const before = await repo.getReport(id);
    const originalId = before?.measurements[0]?.id;
    expect(originalId).toEqual(expect.any(String));

    await repo.updateReport(id, reportInput(), [
      measurementInput({ id: originalId, value: 3.1, valueText: '3,1' }),
    ]);

    const after = await repo.getReport(id);
    expect(after?.measurements).toHaveLength(1);
    expect(after?.measurements[0]?.id).toBe(originalId);
    expect(after?.measurements[0]?.value).toBe(3.1);
  });

  it('gives a fresh id to a row added during the edit, keeping the existing one', async () => {
    const id = await repo.saveReport(reportInput(), [measurementInput()]);
    const before = await repo.getReport(id);
    const originalId = before?.measurements[0]?.id;

    await repo.updateReport(id, reportInput(), [
      measurementInput({ id: originalId }),
      measurementInput({
        analyteId: 'ft4',
        value: 1.4,
        valueText: '1,40',
        unit: 'ng/dL',
        refMin: 0.93,
        refMax: 1.7,
      }),
    ]);

    const after = await repo.getReport(id);
    expect(after?.measurements).toHaveLength(2);
    const ids = after?.measurements.map((m) => m.id) ?? [];
    expect(ids).toContain(originalId);
    const newId = ids.find((mid) => mid !== originalId);
    expect(newId).toEqual(expect.any(String));
    expect(newId).not.toBe(originalId);
    expect(newId).not.toBe('');
  });

  it('deletes a measurement the edit dropped', async () => {
    const id = await repo.saveReport(reportInput(), [
      measurementInput(),
      measurementInput({
        analyteId: 'ft4',
        value: 1.4,
        valueText: '1,40',
        unit: 'ng/dL',
        refMin: 0.93,
        refMax: 1.7,
      }),
    ]);
    const before = await repo.getReport(id);
    const keptId = before?.measurements.find((m) => m.analyteId === 'tsh')?.id;

    await repo.updateReport(id, reportInput(), [measurementInput({ id: keptId })]);

    const after = await repo.getReport(id);
    expect(after?.measurements).toHaveLength(1);
    expect(after?.measurements[0]?.id).toBe(keptId);
    expect(await db.measurements.where('reportId').equals(id).count()).toBe(1);
  });

  it('deletes measurements and attachment with the report', async () => {
    const id = await repo.saveReport(
      reportInput(),
      [measurementInput()],
      [{ data: new ArrayBuffer(4), mimeType: 'image/png', fileName: 'foto.png' }],
    );
    await repo.deleteReport(id);
    expect(await repo.getReport(id)).toBeUndefined();
    expect(await db.measurements.count()).toBe(0);
    expect(await db.attachments.count()).toBe(0);
  });
});

describe('queries', () => {
  beforeEach(async () => {
    await repo.saveReport(reportInput({ sampleDate: '2021-07-10' }), [
      measurementInput({ value: 5.48, valueText: '5,48' }),
    ]);
    await repo.saveReport(
      reportInput({ sampleDate: '2021-08-30', lab: 'AST Vallerosa', adapterId: 'ast' }),
      [
        measurementInput({
          value: 5.72,
          valueText: '5,72',
          refMin: 0.25,
          refMax: 4,
          refText: 'da 0,25 a 4',
        }),
      ],
    );
    await repo.saveReport(
      reportInput({ sampleDate: '2021-10-04', type: 'misto', fileHash: 'abc' }),
      [
        measurementInput({ value: 5.31, valueText: '5,31' }),
        measurementInput({
          analyteId: null,
          customAnalyteId: 'c1',
          value: null,
          valueText: 'Rare',
          unit: null,
          refMin: null,
          refMax: null,
          refText: null,
        }),
      ],
    );
  });

  it('lists reports newest first and filters them', async () => {
    expect((await repo.listReports()).map((r) => r.sampleDate)).toEqual([
      '2021-10-04',
      '2021-08-30',
      '2021-07-10',
    ]);
    expect((await repo.listReports({ lab: ' proavis ' })).map((r) => r.sampleDate)).toEqual([
      '2021-10-04',
      '2021-07-10',
    ]);
    expect((await repo.listReports({ type: 'urine' })).map((r) => r.sampleDate)).toEqual([
      '2021-10-04',
    ]);
    expect(
      (await repo.listReports({ from: '2021-08-01', to: '2021-12-31' })).map((r) => r.sampleDate),
    ).toEqual(['2021-10-04', '2021-08-30']);
  });

  it('summarises reports with their value counts', async () => {
    const summaries = await repo.listReportSummaries({ lab: 'PROAVIS' });
    expect(summaries.map((s) => [s.report.sampleDate, s.total, s.outOfRange])).toEqual([
      ['2021-10-04', 2, 1],
      ['2021-07-10', 1, 1],
    ]);
  });

  it('returns a series oldest first with date and lab', async () => {
    const series = await repo.listSeries({ kind: 'catalog', id: 'tsh' });
    expect(series.map((p) => [p.sampleDate, p.lab, p.measurement.value])).toEqual([
      ['2021-07-10', 'PROAVIS', 5.48],
      ['2021-08-30', 'AST Vallerosa', 5.72],
      ['2021-10-04', 'PROAVIS', 5.31],
    ]);
    expect(await repo.listSeries({ kind: 'custom', id: 'c1' })).toHaveLength(1);
    expect(await repo.listSeries({ kind: 'catalog', id: 'ft4' })).toEqual([]);
  });

  it('proposes unit and range of the latest report for manual entry', async () => {
    expect(await repo.latestReferenceFor({ kind: 'catalog', id: 'tsh' })).toEqual({
      unit: 'µUI/mL',
      refMin: 0.27,
      refMax: 4.2,
      refText: 'da 0,27 a 4,20',
      sampleDate: '2021-10-04',
    });
    expect(await repo.latestReferenceFor({ kind: 'catalog', id: 'ft4' })).toBeUndefined();
  });

  it('finds duplicates by file hash or by date and lab', async () => {
    expect(
      await repo.findDuplicates({ sampleDate: '2021-08-30', lab: 'ast vallerosa' }),
    ).toHaveLength(1);
    expect(
      await repo.findDuplicates({ sampleDate: '2030-01-01', lab: 'Altro', fileHash: 'abc' }),
    ).toHaveLength(1);
    expect(
      await repo.findDuplicates({ sampleDate: '2030-01-01', lab: 'Altro', fileHash: null }),
    ).toEqual([]);
  });

  it('matches by hash alone when sampleDate and lab are both omitted', async () => {
    expect(await repo.findDuplicates({ fileHash: 'abc' })).toHaveLength(1);
    expect(await repo.findDuplicates({ fileHash: 'missing' })).toEqual([]);
    expect(await repo.findDuplicates({})).toEqual([]);
  });

  it('lists the labs seen so far', async () => {
    expect(await repo.listLabs()).toEqual(['AST Vallerosa', 'PROAVIS']);
  });
});

describe('listLatestPerAnalyte', () => {
  const TSH = { kind: 'catalog', id: 'tsh' } as const;
  const find = (
    entries: Awaited<ReturnType<ReportRepository['listLatestPerAnalyte']>>,
    id: string,
  ) => entries.find((e) => e.ref.id === id);

  it('gives each entry with data its latest and previous measurement, by sample date', async () => {
    await repo.saveReport(reportInput({ sampleDate: '2021-10-04' }), [
      measurementInput({ value: 5.31, valueText: '5,31' }),
    ]);
    await repo.saveReport(reportInput({ sampleDate: '2022-08-20' }), [
      measurementInput({ value: 5.07, valueText: '5,07' }),
    ]);
    await repo.saveReport(reportInput({ sampleDate: '2021-07-10' }), [
      measurementInput({ value: 5.48, valueText: '5,48' }),
      measurementInput({ analyteId: 'ft4', value: 1.56, valueText: '1,56', unit: 'ng/dL' }),
    ]);

    const entries = await repo.listLatestPerAnalyte();
    expect(entries).toHaveLength(2);
    const tsh = find(entries, 'tsh')!;
    expect(tsh.ref).toEqual(TSH);
    expect([tsh.latest.sampleDate, tsh.latest.measurement.value]).toEqual(['2022-08-20', 5.07]);
    expect([tsh.previous?.sampleDate, tsh.previous?.measurement.value]).toEqual([
      '2021-10-04',
      5.31,
    ]);
    expect(tsh.latest.lab).toBe('PROAVIS');
    expect(tsh.count).toBe(3);
    const ft4 = find(entries, 'ft4')!;
    expect(ft4.previous).toBeNull();
    expect(ft4.count).toBe(1);
  });

  it('agrees with listSeries on which of two same-day measurements is the latest', async () => {
    await repo.saveReport(reportInput({ sampleDate: '2022-08-20', lab: 'PROAVIS' }), [
      measurementInput({ id: 'm-b', value: 5.07 }),
    ]);
    await repo.saveReport(reportInput({ sampleDate: '2022-08-20', lab: 'AST Vallerosa' }), [
      measurementInput({ id: 'm-a', value: 4.9 }),
    ]);
    const series = await repo.listSeries(TSH);
    const tsh = find(await repo.listLatestPerAnalyte(), 'tsh')!;
    expect(tsh.latest.measurement.id).toBe(series[series.length - 1]!.measurement.id);
    expect(tsh.previous?.measurement.id).toBe(series[series.length - 2]!.measurement.id);
  });

  it('includes custom entries and leaves out rows never assigned to an entry', async () => {
    await repo.saveReport(reportInput(), [
      measurementInput({ analyteId: null, customAnalyteId: 'c1', value: 9, unit: 'µmol/L' }),
      measurementInput({ analyteId: null, customAnalyteId: null, value: 3 }),
    ]);
    const entries = await repo.listLatestPerAnalyte();
    expect(entries.map((e) => e.ref)).toEqual([{ kind: 'custom', id: 'c1' }]);
  });

  it('ignores measurements whose report no longer exists', async () => {
    await db.measurements.put({
      id: 'orphan',
      reportId: 'gone',
      analyteId: 'tsh',
      customAnalyteId: null,
      value: 1,
      comparator: null,
      valueText: '1',
      unit: 'µUI/mL',
      refMin: null,
      refMax: null,
      refText: null,
      outOfRange: null,
      confidence: 1,
      section: null,
      order: 0,
    });
    expect(await repo.listLatestPerAnalyte()).toEqual([]);
  });

  it('is empty without data', async () => {
    expect(await repo.listLatestPerAnalyte()).toEqual([]);
  });
});
