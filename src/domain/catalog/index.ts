import type { Analyte } from '../types';
import { hematology } from './hematology';
import { electrolytes, glucose, iron, kidney, lipids, vitamins } from './metabolic';
import { coagulation, inflammation, other, proteins } from './misc';
import { hormones, liver, thyroid } from './organs';
import { urine } from './urine';

/** The canonical analyte list. Data only: add analytes here, never scatter them in logic. */
export const CATALOG: readonly Analyte[] = [
  ...hematology,
  ...inflammation,
  ...lipids,
  ...glucose,
  ...kidney,
  ...liver,
  ...thyroid,
  ...electrolytes,
  ...iron,
  ...vitamins,
  ...hormones,
  ...coagulation,
  ...proteins,
  ...other,
  ...urine,
];

const BY_ID = new Map(CATALOG.map((analyte) => [analyte.id, analyte]));

export function getAnalyte(id: string): Analyte | undefined {
  return BY_ID.get(id);
}
