import type { Analyte } from '../types';

const qualitative = (id: string, name: string, aliases: string[]): Analyte => ({
  id,
  name,
  aliases,
  category: 'urine',
  specimen: 'urine',
  kind: 'qualitative',
});

export const urine: Analyte[] = [
  qualitative('urine-color', 'Colore', ['Colore']),
  qualitative('urine-appearance', 'Aspetto', ['Aspetto']),
  {
    id: 'urine-ph',
    name: 'pH urinario',
    aliases: ['Reazione(PH)', 'Reazione pH', 'pH', 'Reazione'],
    category: 'urine',
    specimen: 'urine',
    kind: 'numeric',
    plausible: { min: 4, max: 9.5 },
  },
  {
    id: 'urine-specific-gravity',
    name: 'Peso specifico',
    aliases: ['Peso specifico', 'Densità', 'Densita relativa'],
    category: 'urine',
    specimen: 'urine',
    kind: 'numeric',
    // Printed as "1.029" with a decimal point, unlike every other number on Italian reports.
    plausible: { min: 1, max: 1.06 },
  },
  qualitative('urine-glucose', 'Glucosio urinario', [
    'Glucosio',
    'Glucosio urinario',
    'Glicosuria',
  ]),
  qualitative('urine-protein', 'Proteine urinarie', [
    'Proteine',
    'Proteine urinarie',
    'Proteinuria',
  ]),
  qualitative('urine-hemoglobin', 'Emoglobina urinaria', [
    'Emoglobina',
    'Sangue',
    'Emoglobina urinaria',
  ]),
  qualitative('urine-ketones', 'Corpi chetonici', ['Corpi chetonici', 'Chetoni']),
  qualitative('urine-bilirubin', 'Bilirubina urinaria', ['Bilirubina', 'Bilirubina urinaria']),
  qualitative('urine-urobilinogen', 'Urobilinogeno', ['Urobilinogeno']),
  qualitative('urine-nitrites', 'Nitriti', ['Nitriti']),
  qualitative('urine-leukocyte-esterase', 'Esterasi leucocitaria', [
    'Esterasi Leucocitaria',
    'Esterasi leucocitaria',
  ]),
  qualitative('urine-crystals', 'Cristalli', ['Cristalli']),
  qualitative('urine-epithelial-cells', 'Cellule epiteliali', [
    'Cellule epiteliali squamose',
    'Cellule epiteliali',
    'Cellule di sfaldamento',
  ]),
  qualitative('urine-leukocytes', 'Leucociti nel sedimento', ['Leucociti']),
  qualitative('urine-erythrocytes', 'Emazie nel sedimento', [
    'Emazie',
    'Eritrociti',
    'Globuli rossi',
  ]),
  qualitative('urine-bacteria', 'Batteri', ['Batteri', 'Flora batterica']),
  qualitative('urine-casts', 'Cilindri', ['Cilindri', 'Cilindri ialini']),
  qualitative('urine-mucus', 'Muco', ['Muco', 'Filamenti di muco']),
];
