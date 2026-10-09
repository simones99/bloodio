import { describe, expect, it } from 'vitest';
import type { Measurement, Report } from '../../src/domain/types';
import type { AnalyteLatest, ReportSummary, SeriesPoint } from '../../src/storage/types';
import { buildHome, olderCutoff } from '../../src/ui/home/home-view';

const TODAY = new Date(2026, 9, 9);

let counter = 0;
function point(sampleDate: string, overrides: Partial<Measurement> = {}): SeriesPoint {
  counter += 1;
  const measurement: Measurement = {
    id: `m${counter}`,
    reportId: `r-${sampleDate}`,
    analyteId: 'tsh',
    customAnalyteId: null,
    value: 5.07,
    comparator: null,
    valueText: '5,07',
    unit: 'µUI/mL',
    refMin: 0.27,
    refMax: 4.2,
    refText: 'da 0,27 a 4,20',
    outOfRange: true,
    confidence: 1,
    section: null,
    order: 0,
    ...overrides,
  };
  return { measurement, reportId: measurement.reportId, sampleDate, lab: 'PROAVIS' };
}

function entry(latest: SeriesPoint, previous: SeriesPoint | null = null): AnalyteLatest {
  const m = latest.measurement;
  return {
    ref: m.analyteId
      ? { kind: 'catalog', id: m.analyteId }
      : { kind: 'custom', id: m.customAnalyteId! },
    latest,
    previous,
    count: previous ? 2 : 1,
  };
}

function summary(sampleDate: string): ReportSummary {
  const report: Report = {
    id: `r-${sampleDate}`,
    profileId: 'default',
    sampleDate,
    lab: 'PROAVIS',
    type: 'sangue',
    source: 'parser',
    adapterId: 'proavis',
    notes: '',
    fileHash: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
  return { report, total: 25, outOfRange: 4, notEvaluable: 0 };
}

const ft4 = (date: string, value: number) =>
  point(date, {
    analyteId: 'ft4',
    value,
    valueText: String(value).replace('.', ','),
    unit: 'ng/dL',
    refMin: 0.9,
    refMax: 1.7,
    refText: null,
    outOfRange: value < 0.9 || value > 1.7,
  });

const glucose = (date: string, value: number) =>
  point(date, {
    analyteId: 'glucose',
    value,
    valueText: String(value),
    unit: 'mg/dL',
    refMin: 70,
    refMax: 110,
    refText: null,
    outOfRange: value < 70 || value > 110,
  });

const qualitative = (date: string, id: string) =>
  point(date, {
    analyteId: id,
    value: null,
    valueText: 'Presenti',
    unit: null,
    refMin: null,
    refMax: null,
    refText: 'Assenti',
    outOfRange: true,
  });

const home = (entries: AnalyteLatest[], summaries: ReportSummary[] = [summary('2022-08-20')]) =>
  buildHome({
    entries,
    summaries,
    custom: [],
    preferredUnits: {},
    system: 'printed',
    today: TODAY,
  });

const keys = (items: { key: string }[]) => items.map((i) => i.key);

describe('olderCutoff', () => {
  it('is the same calendar day twelve months earlier', () => {
    expect(olderCutoff(TODAY)).toBe('2025-10-09');
  });
});

describe('buildHome', () => {
  it('has no slab and empty lists without reports', () => {
    const view = home([], []);
    expect(view.latest).toBeNull();
    expect(view.outOfRange).toEqual({ current: [], older: [], olderHidden: 0 });
    expect(view.watch).toEqual({ current: [], older: [], olderHidden: 0 });
    expect(view.recent).toEqual([]);
  });

  it('splits the latest report from older ones and counts those past twelve months', () => {
    const view = home([
      entry(point('2022-08-20')), // TSH, in the latest report
      entry(ft4('2025-10-09', 2.5)), // on the cutoff day: still shown
      entry(glucose('2025-10-08', 130)), // one day too old: only counted
    ]);
    expect(keys(view.outOfRange.current)).toEqual(['tsh']);
    expect(keys(view.outOfRange.older)).toEqual(['ft4']);
    expect(view.outOfRange.olderHidden).toBe(1);
  });

  it('keeps an entry of the latest report out of the older block', () => {
    const view = home([entry(point('2022-08-20'), point('2021-10-04', { value: 5.31 }))]);
    expect(keys(view.outOfRange.current)).toEqual(['tsh']);
    expect(view.outOfRange.older).toEqual([]);
  });

  it('puts the value farthest from its limit first, values without a distance last by name', () => {
    const view = home([
      entry(qualitative('2022-08-20', 'urine-protein')),
      entry(point('2022-08-20')), // (5,07 − 4,2) / 3,93 ≈ 0,22
      entry(qualitative('2022-08-20', 'urine-glucose')),
      entry(ft4('2022-08-20', 2.5)), // (2,5 − 1,7) / 0,8 = 1
    ]);
    expect(keys(view.outOfRange.current)).toEqual(['ft4', 'tsh', 'urine-glucose', 'urine-protein']);
    expect(view.outOfRange.current[0]!.distance).toBeCloseTo(1);
    expect(view.outOfRange.current[2]!.distance).toBeNull();
  });

  it('lists "da tenere d’occhio" closest to the limit first, with its side', () => {
    const view = home([
      entry(glucose('2022-08-20', 105), glucose('2021-10-04', 91)), // (110 − 105) / 40 = 0,125
      entry(
        point('2022-08-20', { value: 0.3, valueText: '0,3', outOfRange: false }),
        point('2021-10-04', { value: 0.5, valueText: '0,5', outOfRange: false }),
      ), // (0,3 − 0,27) / 3,93 ≈ 0,008
    ]);
    expect(view.watch.current.map((i) => [i.key, i.watch])).toEqual([
      ['tsh', 'lower'],
      ['glucose', 'upper'],
    ]);
    expect(view.outOfRange.current).toEqual([]);
  });

  it('treats an entry dated like the latest report as current even from another report', () => {
    const view = home(
      [entry({ ...point('2022-08-20'), reportId: 'r-b' })],
      [
        { ...summary('2022-08-20'), report: { ...summary('2022-08-20').report, id: 'r-a' } },
        { ...summary('2022-08-20'), report: { ...summary('2022-08-20').report, id: 'r-b' } },
      ],
    );
    expect(keys(view.outOfRange.current)).toEqual(['tsh']);
    expect(view.outOfRange.older).toEqual([]);
  });

  it('counts hidden watched entries and ignores old entries that fail the rule', () => {
    const view = home([
      entry(glucose('2025-03-01', 105), glucose('2025-01-10', 91)),
      entry(ft4('2025-03-01', 1.18)),
    ]);
    expect(view.watch.olderHidden).toBe(1);
    expect(view.outOfRange.olderHidden).toBe(0);
    expect(view.watch.older).toEqual([]);
  });

  it('puts the latest report on the slab and the three most recent below', () => {
    const view = home(
      [],
      ['2022-08-20', '2021-10-04', '2021-08-30', '2021-07-10'].map((d) => summary(d)),
    );
    expect(view.latest?.report.id).toBe('r-2022-08-20');
    expect(view.recent.map((s) => s.report.sampleDate)).toEqual([
      '2022-08-20',
      '2021-10-04',
      '2021-08-30',
    ]);
  });
});
