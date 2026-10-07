import { BloodioDb } from '../../src/storage/db';
import type { MeasurementInput, ReportInput } from '../../src/storage/types';

/** A fresh database per test: fake-indexeddb keeps data in memory for the whole process. */
export async function freshDb(): Promise<BloodioDb> {
  const db = new BloodioDb(`test-${crypto.randomUUID()}`);
  await db.open();
  return db;
}

export const reportInput = (overrides: Partial<ReportInput> = {}): ReportInput => ({
  sampleDate: '2022-08-20',
  lab: 'PROAVIS',
  type: 'sangue',
  source: 'parser',
  adapterId: 'proavis',
  notes: '',
  fileHash: null,
  ...overrides,
});

export const measurementInput = (overrides: Partial<MeasurementInput> = {}): MeasurementInput => ({
  analyteId: 'tsh',
  customAnalyteId: null,
  value: 5.07,
  comparator: null,
  valueText: '5,07',
  unit: 'µUI/mL',
  refMin: 0.27,
  refMax: 4.2,
  refText: 'da 0,27 a 4,20',
  confidence: 1,
  section: 'MONITORAGGIO TIROIDE',
  ...overrides,
});
