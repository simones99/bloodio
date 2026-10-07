import { computeOutOfRange } from '../domain/out-of-range';
import { reportTypeMatchesFilter } from '../domain/report-type';
import {
  analyteRefOf,
  analyteRefToString,
  type AnalyteRef,
  type Measurement,
  type Report,
} from '../domain/types';
import { DEFAULT_PROFILE_ID, type BloodioDb } from './db';
import { createEmitter } from './events';
import {
  normalizeLab,
  type AnalyteLatest,
  type MeasurementInput,
  type ReportFilter,
  type ReportInput,
  type ReportRepository,
  type SeriesPoint,
} from './types';

function toMeasurements(reportId: string, inputs: MeasurementInput[]): Measurement[] {
  return inputs.map((input, order) => ({
    ...input,
    id: input.id ?? crypto.randomUUID(),
    reportId,
    order,
    outOfRange: computeOutOfRange(input),
  }));
}

export function createReportRepository(db: BloodioDb): ReportRepository {
  const emitter = createEmitter();
  const touch = (now: string) => db.settings.put({ key: 'dataChangedAt', value: now });

  async function seriesOf(ref: AnalyteRef): Promise<SeriesPoint[]> {
    const index = ref.kind === 'catalog' ? 'analyteId' : 'customAnalyteId';
    const measurements = await db.measurements.where(index).equals(ref.id).toArray();
    const reports = await db.reports.bulkGet([...new Set(measurements.map((m) => m.reportId))]);
    const byId = new Map(reports.filter((r): r is Report => r !== undefined).map((r) => [r.id, r]));
    return measurements
      .flatMap((measurement) => {
        const report = byId.get(measurement.reportId);
        return report
          ? [{ measurement, reportId: report.id, sampleDate: report.sampleDate, lab: report.lab }]
          : [];
      })
      .sort((a, b) => a.sampleDate.localeCompare(b.sampleDate));
  }

  async function latestPerAnalyte(): Promise<AnalyteLatest[]> {
    const measurements = await db.measurements.toArray();
    const reports = await db.reports.bulkGet([...new Set(measurements.map((m) => m.reportId))]);
    const byId = new Map(reports.filter((r): r is Report => r !== undefined).map((r) => [r.id, r]));
    const groups = new Map<string, { ref: AnalyteRef; points: SeriesPoint[] }>();
    for (const measurement of measurements) {
      const ref = analyteRefOf(measurement);
      const report = byId.get(measurement.reportId);
      if (!ref || !report) continue;
      const key = analyteRefToString(ref);
      const group = groups.get(key) ?? { ref, points: [] };
      group.points.push({
        measurement,
        reportId: report.id,
        sampleDate: report.sampleDate,
        lab: report.lab,
      });
      groups.set(key, group);
    }
    // Primary-key order within an entry matches the index order listSeries reads, so the stable
    // sort by date breaks same-day ties the same way.
    return [...groups.values()].map(({ ref, points }) => {
      points.sort((a, b) => a.sampleDate.localeCompare(b.sampleDate));
      return {
        ref,
        latest: points[points.length - 1]!,
        previous: points[points.length - 2] ?? null,
        count: points.length,
      };
    });
  }

  async function listReports(filter: ReportFilter = {}): Promise<Report[]> {
    const reports = await db.reports.orderBy('sampleDate').reverse().toArray();
    const lab = filter.lab === undefined ? undefined : normalizeLab(filter.lab);
    return reports.filter(
      (r) =>
        (filter.type === undefined || reportTypeMatchesFilter(r.type, filter.type)) &&
        (lab === undefined || normalizeLab(r.lab) === lab) &&
        (filter.from === undefined || r.sampleDate >= filter.from) &&
        (filter.to === undefined || r.sampleDate <= filter.to),
    );
  }

  return {
    async saveReport(input: ReportInput, measurements, attachments = []) {
      const id = crypto.randomUUID();
      const now = new Date().toISOString();
      const report: Report = {
        ...input,
        id,
        profileId: DEFAULT_PROFILE_ID,
        createdAt: now,
        updatedAt: now,
      };
      await db.transaction(
        'rw',
        [db.reports, db.measurements, db.attachments, db.settings],
        async () => {
          await db.reports.add(report);
          await db.measurements.bulkAdd(toMeasurements(id, measurements));
          await db.attachments.bulkAdd(
            attachments.map((attachment, order) => ({
              ...attachment,
              id: crypto.randomUUID(),
              reportId: id,
              order,
              size: attachment.data.byteLength,
            })),
          );
          await touch(now);
        },
      );
      emitter.emit();
      return id;
    },

    async updateReport(id, input, measurements) {
      const now = new Date().toISOString();
      await db.transaction('rw', [db.reports, db.measurements, db.settings], async () => {
        const existing = await db.reports.get(id);
        if (!existing) throw new Error(`Report not found: ${id}`);
        await db.reports.put({ ...existing, ...input, updatedAt: now });
        // Ids here only ever come from this same report's own measurements (the edit session is
        // seeded from getReport), so bulkPut cannot steal a row from another report.
        const keepIds = new Set(
          measurements.map((m) => m.id).filter((mid): mid is string => mid !== undefined),
        );
        const current = await db.measurements.where('reportId').equals(id).toArray();
        const removed = current.filter((m) => !keepIds.has(m.id)).map((m) => m.id);
        if (removed.length > 0) await db.measurements.bulkDelete(removed);
        await db.measurements.bulkPut(toMeasurements(id, measurements));
        await touch(now);
      });
      emitter.emit();
    },

    async deleteReport(id) {
      const now = new Date().toISOString();
      await db.transaction(
        'rw',
        [db.reports, db.measurements, db.attachments, db.settings],
        async () => {
          await db.measurements.where('reportId').equals(id).delete();
          await db.attachments.where('reportId').equals(id).delete();
          await db.reports.delete(id);
          await touch(now);
        },
      );
      emitter.emit();
    },

    async getReport(id) {
      const report = await db.reports.get(id);
      if (!report) return undefined;
      const measurements = await db.measurements.where('reportId').equals(id).sortBy('order');
      return { report, measurements };
    },

    listReports,

    async listReportSummaries(filter = {}) {
      const reports = await listReports(filter);
      return Promise.all(
        reports.map(async (report) => {
          const byReport = db.measurements.where('reportId').equals(report.id);
          const [total, outOfRange] = await Promise.all([
            byReport.count(),
            byReport
              .clone()
              .filter((m) => m.outOfRange === true)
              .count(),
          ]);
          return { report, total, outOfRange };
        }),
      );
    },

    listSeries: seriesOf,

    listLatestPerAnalyte: latestPerAnalyte,

    async latestReferenceFor(ref) {
      const series = await seriesOf(ref);
      const last = series[series.length - 1];
      if (!last) return undefined;
      const { unit, refMin, refMax, refText } = last.measurement;
      return { unit, refMin, refMax, refText, sampleDate: last.sampleDate };
    },

    async findDuplicates(query) {
      const found = new Map<string, Report>();
      if (query.sampleDate !== undefined && query.lab !== undefined) {
        const lab = normalizeLab(query.lab);
        const sameDay = await db.reports.where('sampleDate').equals(query.sampleDate).toArray();
        for (const r of sameDay.filter((r) => normalizeLab(r.lab) === lab)) found.set(r.id, r);
      }
      if (query.fileHash) {
        for (const r of await db.reports.where('fileHash').equals(query.fileHash).toArray()) {
          found.set(r.id, r);
        }
      }
      return [...found.values()];
    },

    async listLabs() {
      const labs = await db.reports.orderBy('lab').uniqueKeys();
      return labs.map(String).filter((lab) => lab !== '');
    },

    subscribe: emitter.subscribe,
  };
}
