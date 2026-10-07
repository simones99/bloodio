import type { Analyte } from '../types';

const CHOLESTEROL_UNITS = [{ unit: 'mmol/L', toCanonical: 38.67 }];

const lipid = (id: string, name: string, aliases: string[]): Analyte => ({
  id,
  name,
  aliases,
  category: 'lipidi',
  specimen: 'blood',
  kind: 'numeric',
  canonicalUnit: 'mg/dL',
  units: CHOLESTEROL_UNITS,
});

export const lipids: Analyte[] = [
  lipid('total-cholesterol', 'Colesterolo totale', [
    'Colesterolo totale',
    'Colesterolo',
    'Colesterolemia',
  ]),
  lipid('hdl-cholesterol', 'Colesterolo HDL', ['Colesterolo HDL', 'HDL', 'HDL colesterolo']),
  lipid('ldl-cholesterol', 'Colesterolo LDL', [
    'Colesterolo LDL',
    'LDL',
    'LDL colesterolo',
    'Colesterolo LDL calcolato',
  ]),
  lipid('non-hdl-cholesterol', 'Colesterolo non HDL', [
    'Colesterolo non HDL',
    'Non HDL colesterolo',
  ]),
  {
    id: 'triglycerides',
    name: 'Trigliceridi',
    aliases: ['Trigliceridi', 'Trigliceridemia'],
    category: 'lipidi',
    specimen: 'blood',
    kind: 'numeric',
    canonicalUnit: 'mg/dL',
    // 1 mmol/L = 88.57 mg/dL
    units: [{ unit: 'mmol/L', toCanonical: 88.57 }],
  },
  {
    id: 'lipoprotein-a',
    name: 'Lipoproteina (a)',
    aliases: ['Lipoproteina (a)', 'Lp(a)', 'Lipoproteina a'],
    category: 'lipidi',
    specimen: 'blood',
    kind: 'numeric',
    canonicalUnit: 'mg/dL',
  },
  {
    id: 'apo-a1',
    name: 'Apolipoproteina A1',
    aliases: ['Apolipoproteina A1', 'Apo A1'],
    category: 'lipidi',
    specimen: 'blood',
    kind: 'numeric',
    canonicalUnit: 'mg/dL',
  },
  {
    id: 'apo-b',
    name: 'Apolipoproteina B',
    aliases: ['Apolipoproteina B', 'Apo B'],
    category: 'lipidi',
    specimen: 'blood',
    kind: 'numeric',
    canonicalUnit: 'mg/dL',
  },
];

export const glucose: Analyte[] = [
  {
    id: 'glucose',
    name: 'Glicemia',
    aliases: ['Glicemia', 'Glucosio', 'Glicemia a digiuno'],
    category: 'glicemia',
    specimen: 'blood',
    kind: 'numeric',
    canonicalUnit: 'mg/dL',
    // 1 mmol/L = 18.016 mg/dL
    units: [{ unit: 'mmol/L', toCanonical: 18.016 }],
    plausible: { min: 10, max: 1500 },
  },
  {
    id: 'hba1c',
    name: 'Emoglobina glicata',
    aliases: ['Emoglobina glicata', 'HbA1c', 'Emoglobina glicosilata', 'Glicata'],
    category: 'glicemia',
    specimen: 'blood',
    kind: 'numeric',
    // % (NGSP) and mmol/mol (IFCC) are related by an affine formula, not a factor: kept as separate series.
    canonicalUnit: '%',
    plausible: { min: 3, max: 20 },
  },
  {
    id: 'insulin',
    name: 'Insulina',
    aliases: ['Insulina', 'Insulinemia'],
    category: 'glicemia',
    specimen: 'blood',
    kind: 'numeric',
    canonicalUnit: 'µUI/mL',
    units: [{ unit: 'mUI/L', toCanonical: 1 }],
  },
  {
    id: 'c-peptide',
    name: 'Peptide C',
    aliases: ['Peptide C', 'C-peptide'],
    category: 'glicemia',
    specimen: 'blood',
    kind: 'numeric',
    canonicalUnit: 'ng/mL',
  },
];

export const kidney: Analyte[] = [
  {
    id: 'creatinine',
    name: 'Creatinina',
    aliases: ['Creatinina', 'Creatininemia'],
    category: 'renale',
    specimen: 'blood',
    kind: 'numeric',
    canonicalUnit: 'mg/dL',
    // 1 mg/dL = 88.4 µmol/L
    units: [{ unit: 'µmol/L', toCanonical: 1 / 88.4 }],
  },
  {
    id: 'urea',
    name: 'Azotemia',
    aliases: ['Azotemia', 'Urea'],
    category: 'renale',
    specimen: 'blood',
    kind: 'numeric',
    canonicalUnit: 'mg/dL',
    // urea: 1 mmol/L = 6.006 mg/dL
    units: [{ unit: 'mmol/L', toCanonical: 6.006 }],
  },
  {
    id: 'uric-acid',
    name: 'Acido urico',
    aliases: ['Acido urico', 'Uricemia'],
    category: 'renale',
    specimen: 'blood',
    kind: 'numeric',
    canonicalUnit: 'mg/dL',
    // 1 mg/dL = 59.48 µmol/L
    units: [{ unit: 'µmol/L', toCanonical: 1 / 59.48 }],
  },
  {
    id: 'egfr',
    name: 'Filtrato glomerulare stimato',
    aliases: ['eGFR', 'Filtrato glomerulare', 'GFR stimato', 'Filtrato glomerulare stimato'],
    category: 'renale',
    specimen: 'blood',
    kind: 'numeric',
    canonicalUnit: 'mL/min/1.73m²',
    units: [{ unit: 'mL/min', toCanonical: 1 }],
  },
];

export const electrolytes: Analyte[] = [
  {
    id: 'sodium',
    name: 'Sodio',
    aliases: ['Sodio', 'Na', 'Sodiemia'],
    category: 'elettroliti',
    specimen: 'blood',
    kind: 'numeric',
    canonicalUnit: 'mEq/L',
    units: [{ unit: 'mmol/L', toCanonical: 1 }],
  },
  {
    id: 'potassium',
    name: 'Potassio',
    aliases: ['Potassio', 'K', 'Potassiemia', 'Kaliemia'],
    category: 'elettroliti',
    specimen: 'blood',
    kind: 'numeric',
    canonicalUnit: 'mEq/L',
    units: [{ unit: 'mmol/L', toCanonical: 1 }],
  },
  {
    id: 'chloride',
    name: 'Cloro',
    aliases: ['Cloro', 'Cl', 'Cloruri', 'Cloremia'],
    category: 'elettroliti',
    specimen: 'blood',
    kind: 'numeric',
    canonicalUnit: 'mEq/L',
    units: [{ unit: 'mmol/L', toCanonical: 1 }],
  },
  // calcium: 1 mmol/L = 4.008 mg/dL
  {
    id: 'calcium',
    name: 'Calcio',
    aliases: ['Calcio', 'Calcemia', 'Calcio totale'],
    category: 'elettroliti',
    specimen: 'blood',
    kind: 'numeric',
    canonicalUnit: 'mg/dL',
    units: [{ unit: 'mmol/L', toCanonical: 4.008 }],
  },
  // phosphorus: 1 mmol/L = 3.097 mg/dL
  {
    id: 'phosphorus',
    name: 'Fosforo',
    aliases: ['Fosforo', 'Fosfati', 'Fosforemia'],
    category: 'elettroliti',
    specimen: 'blood',
    kind: 'numeric',
    canonicalUnit: 'mg/dL',
    units: [{ unit: 'mmol/L', toCanonical: 3.097 }],
  },
  // magnesium: 1 mmol/L = 2.431 mg/dL
  {
    id: 'magnesium',
    name: 'Magnesio',
    aliases: ['Magnesio', 'Magnesiemia'],
    category: 'elettroliti',
    specimen: 'blood',
    kind: 'numeric',
    canonicalUnit: 'mg/dL',
    units: [{ unit: 'mmol/L', toCanonical: 2.431 }],
  },
];

export const iron: Analyte[] = [
  // iron: 1 µmol/L = 5.585 µg/dL
  {
    id: 'iron',
    name: 'Sideremia',
    aliases: ['Sideremia', 'Ferro', 'Ferro sierico'],
    category: 'ferro',
    specimen: 'blood',
    kind: 'numeric',
    canonicalUnit: 'µg/dL',
    units: [{ unit: 'µmol/L', toCanonical: 5.585 }],
  },
  {
    id: 'ferritin',
    name: 'Ferritina',
    aliases: ['Ferritina', 'Ferritinemia'],
    category: 'ferro',
    specimen: 'blood',
    kind: 'numeric',
    canonicalUnit: 'ng/mL',
    units: [{ unit: 'µg/L', toCanonical: 1 }],
  },
  {
    id: 'transferrin',
    name: 'Transferrina',
    aliases: ['Transferrina', 'Transferrinemia'],
    category: 'ferro',
    specimen: 'blood',
    kind: 'numeric',
    canonicalUnit: 'mg/dL',
    units: [{ unit: 'g/L', toCanonical: 100 }],
  },
  {
    id: 'transferrin-saturation',
    name: 'Saturazione della transferrina',
    aliases: [
      'Saturazione della transferrina',
      'Saturazione transferrina',
      'Indice di saturazione della transferrina',
    ],
    category: 'ferro',
    specimen: 'blood',
    kind: 'numeric',
    canonicalUnit: '%',
    plausible: { min: 0, max: 100 },
  },
  {
    id: 'tibc',
    name: 'Capacità ferro-legante totale',
    aliases: ['TIBC', 'Capacità ferro legante totale', 'Capacità totale di legare il ferro'],
    category: 'ferro',
    specimen: 'blood',
    kind: 'numeric',
    canonicalUnit: 'µg/dL',
    units: [{ unit: 'µmol/L', toCanonical: 5.585 }],
  },
];

export const vitamins: Analyte[] = [
  // 25-OH vitamin D: 1 nmol/L = 0.4006 ng/mL
  {
    id: 'vitamin-d',
    name: 'Vitamina D (25 OH)',
    aliases: [
      'Vitamina D (25 OH)',
      'Vitamina D',
      '25 OH Vitamina D',
      '25-OH Vitamina D',
      'Vitamina D3',
    ],
    category: 'vitamine',
    specimen: 'blood',
    kind: 'numeric',
    canonicalUnit: 'ng/mL',
    units: [{ unit: 'nmol/L', toCanonical: 0.4006 }],
  },
  // vitamin B12: 1 pmol/L = 1.355 pg/mL
  {
    id: 'vitamin-b12',
    name: 'Vitamina B12',
    aliases: ['Vitamina B12', 'B12', 'Cobalamina'],
    category: 'vitamine',
    specimen: 'blood',
    kind: 'numeric',
    canonicalUnit: 'pg/mL',
    units: [{ unit: 'pmol/L', toCanonical: 1.355 }],
    plausible: { min: 50, max: 5000 },
  },
  // folate: 1 nmol/L = 0.4413 ng/mL
  {
    id: 'folate',
    name: 'Folati',
    aliases: ['Folati', 'Acido folico', 'Folato'],
    category: 'vitamine',
    specimen: 'blood',
    kind: 'numeric',
    canonicalUnit: 'ng/mL',
    units: [{ unit: 'nmol/L', toCanonical: 0.4413 }],
  },
  // zinc: 1 µmol/L = 6.538 µg/dL
  {
    id: 'zinc',
    name: 'Zinco',
    aliases: ['Zinco', 'Zinchemia'],
    category: 'vitamine',
    specimen: 'blood',
    kind: 'numeric',
    canonicalUnit: 'µg/dL',
    units: [{ unit: 'µmol/L', toCanonical: 6.538 }],
  },
];
