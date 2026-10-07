import { describe, expect, it } from 'vitest';
import { matchAnalyte, similarity, specimenOfSection } from '../../src/domain/matching';

const BLOOD = 'EMOCROMO';
const URINE = 'ESAME CHIMICO FISICO URINE';

describe('matchAnalyte: every name printed on the sample reports', () => {
  it.each([
    ['Globuli rossi', '/μl', BLOOD, 'rbc'],
    ['Emoglobina', 'g/dl', BLOOD, 'hemoglobin'],
    ['Valore Ematocrito', '%', BLOOD, 'hematocrit'],
    ['MCV', 'fl', BLOOD, 'mcv'],
    ['MCH', 'pg', BLOOD, 'mch'],
    ['MCHC', 'gr/dl', BLOOD, 'mchc'],
    ['RDW', '%', BLOOD, 'rdw'],
    ['Piastrine', '/μl', BLOOD, 'platelets'],
    ['Globuli bianchi', '/μl', BLOOD, 'wbc'],
    ['Neutrofili', '%', 'FORMULA LEUCOCITARIA', 'neutrophils-pct'],
    ['NEUTROFILI', '/μl', 'FORMULA LEUCOCITARIA', 'neutrophils-abs'],
    ['Eosinofili', '%', 'FORMULA LEUCOCITARIA', 'eosinophils-pct'],
    ['EOSINOFILI', '/μl', 'FORMULA LEUCOCITARIA', 'eosinophils-abs'],
    ['Basofili', '%', 'FORMULA LEUCOCITARIA', 'basophils-pct'],
    ['BASOFILI', '/μl', 'FORMULA LEUCOCITARIA', 'basophils-abs'],
    ['Linfociti', '%', 'FORMULA LEUCOCITARIA', 'lymphocytes-pct'],
    ['LINFOCITI', '/μl', 'FORMULA LEUCOCITARIA', 'lymphocytes-abs'],
    ['Monociti', '%', 'FORMULA LEUCOCITARIA', 'monocytes-pct'],
    ['MONOCITI', '/μl', 'FORMULA LEUCOCITARIA', 'monocytes-abs'],
    ['Sideremia', 'μg/dl', 'METABOLISMO DEL FERRO', 'iron'],
    ['VES', 'mm/1h', "VELOCITA' DI ERITROSEDIMENTAZIONE", 'esr'],
    ['Glicemia', 'mg/dl', 'BIOCHIMICA', 'glucose'],
    ['Acido urico', 'mg/dl', 'BIOCHIMICA', 'uric-acid'],
    ['Creatinina', 'mg/dl', 'BIOCHIMICA', 'creatinine'],
    ['Vitamina D (25 OH)', 'ng/ml', 'BIOCHIMICA', 'vitamin-d'],
    ['Colesterolo totale', 'mg/dl', 'ASSETTO LIPIDICO', 'total-cholesterol'],
    ['Trigliceridi', 'mg/dl', 'ASSETTO LIPIDICO', 'triglycerides'],
    ['Transaminasi AST (GOT)', 'mU/ml', "FUNZIONALITA' EPATICA", 'ast'],
    ['Transaminasi ALT (GPT)', 'mU/ml', "FUNZIONALITA' EPATICA", 'alt'],
    ['Gamma-GT', 'mU/ml', "FUNZIONALITA' EPATICA", 'ggt'],
    ['Tireoglobulina', 'ng/ml', 'MONITORAGGIO TIROIDE', 'thyroglobulin'],
    ['HTG', 'ng/ml', 'MONITORAGGIO TIROIDE', 'thyroglobulin'],
    ['TSH', 'μUI/ml', 'MONITORAGGIO TIROIDE', 'tsh'],
    ['TSH Reflex', 'UI/ml', 'MONITORAGGIO TIROIDE', 'tsh'],
    ['FT4', 'ng/dl', 'MONITORAGGIO TIROIDE', 'ft4'],
    ['FT4', 'pg/ml', 'TIREOTROPINA - TSH - Test riflesso', 'ft4'],
    ['Anticorpi anti Tireoperossidasi', 'UI/ml', 'MONITORAGGIO TIROIDE', 'anti-tpo'],
    ['Ab-anti Perossidasi (Ab-TPO)', 'UI/ml', 'MONITORAGGIO TIROIDE', 'anti-tpo'],
    ['Anticorpi anti Recettore del TSH', 'U/l', 'MONITORAGGIO TIROIDE', 'anti-tshr'],
    ['Ab-anti recettore del TSH', 'U/l', 'MONITORAGGIO TIROIDE', 'anti-tshr'],
    ['Anticorpi anti Tireoglobulina', 'UI/ml', 'MONITORAGGIO TIROIDE', 'anti-tg'],
    ['Ab-anti Tireoglobulina (Ab-HTG)', 'UI/ml', 'MONITORAGGIO TIROIDE', 'anti-tg'],
    ['Colore', '', URINE, 'urine-color'],
    ['Aspetto', '', URINE, 'urine-appearance'],
    ['Reazione(PH)', '', URINE, 'urine-ph'],
    ['Glucosio', 'mg/dl', URINE, 'urine-glucose'],
    ['Proteine', 'mg/dl', URINE, 'urine-protein'],
    ['Emoglobina', '', URINE, 'urine-hemoglobin'],
    ['Corpi chetonici', 'mg/dl', URINE, 'urine-ketones'],
    ['Bilirubina', 'mg/dl', URINE, 'urine-bilirubin'],
    ['Urobilinogeno', 'mg/dl', URINE, 'urine-urobilinogen'],
    ['Nitriti', '', URINE, 'urine-nitrites'],
    ['Esterasi Leucocitaria', 'Leuc/μl', URINE, 'urine-leukocyte-esterase'],
    ['Peso specifico', '', URINE, 'urine-specific-gravity'],
    ['Cristalli', '', 'ESAME DEL SEDIMENTO', 'urine-crystals'],
    ['Cellule epiteliali squamose', '', 'ESAME DEL SEDIMENTO', 'urine-epithelial-cells'],
  ])('%s [%s] in %s -> %s', (name, unit, section, expected) => {
    const match = matchAnalyte(name, { unit, section });
    expect(match).toMatchObject({
      status: 'matched',
      analyteId: expected,
      score: 1,
      ambiguous: false,
    });
  });
});

describe('matchAnalyte: disambiguation and thresholds', () => {
  it('flags homonyms when the unit is missing', () => {
    const match = matchAnalyte('Neutrofili', { section: 'FORMULA LEUCOCITARIA' });
    expect(match.status).toBe('matched');
    expect(match.ambiguous).toBe(true);
  });

  it('separates blood and urine analytes with the same printed name', () => {
    expect(matchAnalyte('Glucosio', { unit: 'mg/dl', section: 'BIOCHIMICA' }).analyteId).toBe(
      'glucose',
    );
    expect(matchAnalyte('Glucosio', { unit: 'mg/dl', section: URINE }).analyteId).toBe(
      'urine-glucose',
    );
  });

  it('auto-matches a small OCR typo in a long name', () => {
    expect(matchAnalyte('Globuli rosi', { unit: '/μl' })).toMatchObject({
      status: 'matched',
      analyteId: 'rbc',
    });
    expect(matchAnalyte('Emoglobna', { unit: 'g/dl' })).toMatchObject({
      status: 'matched',
      analyteId: 'hemoglobin',
    });
  });

  it('only suggests when the similarity is middling', () => {
    // two of the three words of the alias "transaminasi ast got"
    const match = matchAnalyte('Transaminasi AST', { unit: 'mU/ml' });
    expect(match.status).toBe('suggested');
    expect(match.analyteId).toBeNull();
    expect(match.suggestionId).toBe('ast');
    expect(match.score).toBeCloseTo(2 / 3, 5);
  });

  it('never fuzzy-matches short names', () => {
    expect(matchAnalyte('MCHX').status).toBe('none');
    expect(matchAnalyte('TSX').status).toBe('none');
  });

  it('does not confuse analytes that share one word', () => {
    expect(matchAnalyte('Colesterolo VLDL', { unit: 'mg/dl' }).status).not.toBe('matched');
  });

  it('returns none for unknown or empty names', () => {
    expect(matchAnalyte('Ricerca sangue occulto feci').status).toBe('none');
    expect(matchAnalyte('   ').status).toBe('none');
  });

  it('surfaces ambiguity for a homonym with no section context', () => {
    const match = matchAnalyte('Emoglobina');
    expect(match.status).toBe('matched');
    expect(match.ambiguous).toBe(true);
  });

  it('still resolves a homonym via the unit filter alone when the section is unknown', () => {
    const match = matchAnalyte('Glucosio', { unit: 'mg/dl' });
    expect(match.status).toBe('matched');
    expect(match.analyteId).toBe('glucose');
    expect(match.ambiguous).toBe(false);
  });
});

describe('helpers', () => {
  it('reads the specimen from the section title', () => {
    expect(specimenOfSection('ESAME CHIMICO FISICO URINE')).toBe('urine');
    expect(specimenOfSection('ESAME DEL SEDIMENTO')).toBe('urine');
    expect(specimenOfSection('EMATOLOGIA')).toBe('blood');
    expect(specimenOfSection(null)).toBeNull();
    expect(specimenOfSection(undefined)).toBeNull();
    expect(specimenOfSection('')).toBeNull();
  });

  it('computes a symmetric token similarity', () => {
    expect(similarity('globuli rossi', 'globuli rossi')).toBe(1);
    expect(similarity('colesterolo totale', 'colesterolo hdl')).toBeLessThan(0.65);
    expect(similarity('globuli rosi', 'globuli rossi')).toBeGreaterThanOrEqual(0.88);
  });
});
