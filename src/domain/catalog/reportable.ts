import type { PlausibleRange } from '../types';

/**
 * Reportable ranges in canonical unit, from spec 2026-10-16 §6.6. Sources by code (§6.6.3): S1
 * Sysmex XN-L, S2 Beckman DxH 900, S3 ICSH 1993, S4 Alifax Roller 20, S5–S11 FDA 510(k) and
 * CoaguChek, S12–S13 urine strip and refractometer, S14–S51 chemistry method sheets, S52 Roche
 * eLabDoc (CPS_000<n>), S53–S59 Siemens, Beckman, Immusmol, DiaSorin. "def." follows from the
 * definition; "derived" comes from other entries. No source: mch, mchc, ag-ratio, zinc (§6.6.4).
 */
export const REPORTABLE: Readonly<Record<string, PlausibleRange>> = {
  rbc: { min: 10_000, max: 8_600_000 }, // S1
  hemoglobin: { min: 0.1, max: 26 }, // S1
  hematocrit: { min: 0.1, max: 75 }, // S1
  mcv: { min: 50, max: 150 }, // S2
  rdw: { min: 10, max: 40 }, // S2
  platelets: { min: 2_000, max: 5_000_000 }, // S1
  mpv: { min: 5, max: 25 }, // S2
  wbc: { min: 30, max: 440_000 }, // S1
  'neutrophils-pct': { min: 0, max: 100 }, // def.
  'lymphocytes-pct': { min: 0, max: 100 }, // def.
  'monocytes-pct': { min: 0, max: 100 }, // def.
  'eosinophils-pct': { min: 0, max: 100 }, // def.
  'basophils-pct': { min: 0, max: 100 }, // def.
  'reticulocytes-pct': { min: 0, max: 100 }, // def.
  'neutrophils-abs': { min: 0, max: 440_000 }, // S1
  'lymphocytes-abs': { min: 0, max: 440_000 }, // S1
  'monocytes-abs': { min: 0, max: 440_000 }, // S1
  'eosinophils-abs': { min: 0, max: 440_000 }, // S1
  'basophils-abs': { min: 0, max: 440_000 }, // S1
  esr: { min: 0, max: 200 }, // S3, S4
  crp: { min: 0.3, max: 350 }, // S5
  procalcitonin: { min: 0.02, max: 400 }, // S6
  'total-cholesterol': { min: 3.86, max: 8_000 }, // S14
  'hdl-cholesterol': { min: 3, max: 240 }, // S15
  'ldl-cholesterol': { min: 0, max: 1_096 }, // S16
  'non-hdl-cholesterol': { min: 0, max: 7_997 }, // derived: total − HDL
  triglycerides: { min: 8.85, max: 4_425 }, // S17
  'lipoprotein-a': { min: 6, max: 80 }, // S18
  'apo-a1': { min: 10, max: 400 }, // S19
  'apo-b': { min: 10, max: 400 }, // S20
  glucose: { min: 2, max: 1_500 }, // S21
  hba1c: { min: 3.5, max: 24.8 }, // S22, S23
  insulin: { min: 0.2, max: 1_000 }, // S24
  'c-peptide': { min: 0.01, max: 400 }, // S25
  creatinine: { min: 0.06, max: 122.04 }, // S26, S27
  urea: { min: 3, max: 719 }, // S27, S28: urea nitrogen × 2.14
  'uric-acid': { min: 0.2, max: 62.5 }, // S29
  egfr: { min: 0, max: 290 }, // S30 with the creatinine range
  ast: { min: 5, max: 7_000 }, // S31
  alt: { min: 5, max: 7_000 }, // S32
  ggt: { min: 3, max: 13_200 }, // S33
  alp: { min: 5, max: 6_000 }, // S34
  ldh: { min: 10, max: 2_500 }, // S35
  'bilirubin-total': { min: 0.146, max: 76 }, // S36
  'bilirubin-direct': { min: 0.09, max: 34 }, // S37
  'bilirubin-indirect': { min: 0, max: 76 }, // derived: total − direct
  tsh: { min: 0.005, max: 1_000 }, // S52 (533)
  ft4: { min: 0.039, max: 12 }, // S52 (474), S53
  ft3: { min: 0.39, max: 32.6 }, // S52 (473)
  thyroglobulin: { min: 0.1, max: 5_000 }, // S52 (520)
  'anti-tpo': { min: 0.25, max: 100_000 }, // S52 (444), S54
  'anti-tg': { min: 10, max: 4_000 }, // S52 (443)
  'anti-tshr': { min: 0.8, max: 40 }, // S52 (445)
  calcitonin: { min: 0.5, max: 200_000 }, // S52 (451)
  sodium: { min: 80, max: 180 }, // S38
  potassium: { min: 1.5, max: 10 }, // S38
  chloride: { min: 60, max: 140 }, // S38
  calcium: { min: 0.8, max: 20.1 }, // S39
  phosphorus: { min: 0.3, max: 40 }, // S40
  magnesium: { min: 0.243, max: 9.72 }, // S41
  iron: { min: 5, max: 2_100 }, // S52 (133)
  ferritin: { min: 0.5, max: 100_000 }, // S52 (468)
  transferrin: { min: 10, max: 780 }, // S52 (264)
  'transferrin-saturation': { min: 0, max: 100 }, // def.
  tibc: { min: 21.8, max: 3_500 }, // derived: iron + UIBC, S52 (266), S52 (133)
  'vitamin-d': { min: 4, max: 240 }, // S52 (379), S57
  'vitamin-b12': { min: 50, max: 7_500 }, // S52 (536), S58
  folate: { min: 0.6, max: 49.6 }, // S52 (469), S59
  'testosterone-total': { min: 0.025, max: 32 }, // S52 (519), S55
  'testosterone-free': { min: 0.018, max: 60 }, // S56
  shbg: { min: 0.8, max: 2_000 }, // S52 (513)
  cortisol: { min: 0.109, max: 634 }, // S52 (459)
  prolactin: { min: 0.094, max: 4_700 }, // S52 (503)
  estradiol: { min: 5, max: 30_000 }, // S52 (466)
  progesterone: { min: 0.05, max: 60 }, // S52 (501)
  lh: { min: 0.3, max: 200 }, // S52 (492)
  fsh: { min: 0.3, max: 200 }, // S52 (472)
  'dhea-s': { min: 0.1, max: 5_000 }, // S52 (463)
  pth: { min: 6, max: 5_000 }, // S52 (506)
  acth: { min: 1.5, max: 2_000 }, // S52 (429)
  'pt-inr': { min: 0.8, max: 8 }, // S7, S9
  'pt-pct': { min: 5, max: 120 }, // S8
  'pt-sec': { min: 8.7, max: 96 }, // S9, S8
  aptt: { min: 20, max: 139 }, // S9
  'aptt-ratio': { min: 0.67, max: 5.82 }, // derived from S9
  fibrinogen: { min: 50, max: 860 }, // S9
  'd-dimer': { min: 150, max: 80_000 }, // S10, S11
  'total-protein': { min: 0.2, max: 36 }, // S42
  albumin: { min: 0.2, max: 18 }, // S43
  'albumin-pct': { min: 0, max: 100 }, // def.
  'alpha1-pct': { min: 0, max: 100 }, // def.
  'alpha2-pct': { min: 0, max: 100 }, // def.
  'beta1-pct': { min: 0, max: 100 }, // def.
  'beta2-pct': { min: 0, max: 100 }, // def.
  'gamma-pct': { min: 0, max: 100 }, // def.
  'psa-total': { min: 0.006, max: 5_000 }, // S44
  'psa-free': { min: 0.01, max: 50 }, // S45
  cpk: { min: 7, max: 22_000 }, // S46
  amylase: { min: 3, max: 7_500 }, // S47
  lipase: { min: 3, max: 3_000 }, // S48
  homocysteine: { min: 3, max: 250 }, // S49
  'ige-total': { min: 0.1, max: 50_000 }, // S50
  'rheumatoid-factor': { min: 10, max: 650 }, // S51
  'urine-ph': { min: 5, max: 9 }, // S12
  'urine-specific-gravity': { min: 1, max: 1.05 }, // S12, S13
};
