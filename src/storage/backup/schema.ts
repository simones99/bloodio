import { z } from 'zod';

/** Bump together with the Dexie schema version whenever the stored shape changes. */
export const EXPORT_VERSION = 1;

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const category = z.enum([
  'ematologia',
  'lipidi',
  'renale',
  'epatica',
  'tiroide',
  'glicemia',
  'elettroliti',
  'ferro',
  'vitamine',
  'ormoni',
  'infiammazione',
  'coagulazione',
  'proteine',
  'urine',
  'altro',
]);

const profile = z.object({ id: z.string().min(1), name: z.string(), createdAt: z.string() });

const report = z.object({
  id: z.string().min(1),
  profileId: z.string().min(1),
  sampleDate: isoDate,
  lab: z.string(),
  type: z.enum(['sangue', 'urine', 'misto', 'altro']),
  source: z.enum(['parser', 'ocr', 'manuale']),
  adapterId: z.string().nullable(),
  notes: z.string(),
  fileHash: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

const measurement = z.object({
  id: z.string().min(1),
  reportId: z.string().min(1),
  analyteId: z.string().nullable(),
  customAnalyteId: z.string().nullable(),
  value: z.number().nullable(),
  comparator: z.enum(['<', '>', '<=', '>=']).nullable(),
  valueText: z.string(),
  unit: z.string().nullable(),
  refMin: z.number().nullable(),
  refMax: z.number().nullable(),
  refText: z.string().nullable(),
  outOfRange: z.boolean().nullable(),
  confidence: z.number().min(0).max(1),
  section: z.string().nullable(),
  order: z.number().int().min(0),
});

const customAnalyte = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  unit: z.string().nullable(),
  category,
  specimen: z.enum(['blood', 'urine']),
  kind: z.enum(['numeric', 'qualitative']),
});

const attachment = z.object({
  reportId: z.string().min(1),
  mimeType: z.string(),
  fileName: z.string(),
  base64: z.string(),
});

export const exportFileV1 = z.object({
  app: z.literal('bloodio'),
  version: z.literal(1),
  exportedAt: z.string(),
  appVersion: z.string(),
  data: z.object({
    profiles: z.array(profile),
    reports: z.array(report),
    measurements: z.array(measurement),
    customAnalytes: z.array(customAnalyte),
    preferredUnits: z.record(z.string(), z.string()),
    attachments: z.array(attachment),
  }),
});

export type ExportFileV1 = z.infer<typeof exportFileV1>;
/** Always the shape of the current version. */
export type ExportFile = ExportFileV1;
export const currentExportFile = exportFileV1;
