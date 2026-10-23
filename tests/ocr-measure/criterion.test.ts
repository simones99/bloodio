import { describe, expect, it } from 'vitest';
import { lowestThreshold, type CriterionRow } from '../../tools/ocr-measure/criterion';

const row = (
  ocrConfidence: number | null,
  outcome: CriterionRow['outcome'] = 'giusta',
  trustable = true,
): CriterionRow => ({ ocrConfidence, outcome, trustable });

const many = (n: number, make: () => CriterionRow) => Array.from({ length: n }, make);

describe('lowestThreshold (spec 2026-10-16 §6.3)', () => {
  it('picks the lowest threshold, in hundredths, with no error among the passing rows', () => {
    const rows = [...many(300, () => row(0.95)), row(0.904, 'valore sbagliato')];
    const result = lowestThreshold(rows, { synthetic: false });
    // 0.904 passes at 0.90, so the first error-free threshold is 0.91: rounded up, not down.
    expect(result.threshold).toBe(0.91);
    expect(result.failures).toEqual([]);
    expect(result.atErrorFree).toEqual({ threshold: 0.91, passing: 300, read: 301 });
  });

  it('counts a passing extra row as an error', () => {
    const rows = [...many(300, () => row(0.95)), row(0.92, 'in più')];
    expect(lowestThreshold(rows, { synthetic: false }).threshold).toBe(0.93);
  });

  it('counts wrong rows that do not pass as read rows, not as errors', () => {
    const rows = [...many(300, () => row(0.95)), row(0.99, 'unità sbagliata', false)];
    expect(lowestThreshold(rows, { synthetic: false }).threshold).toBe(0);
  });

  it('leaves missing rows out of the read rows', () => {
    const rows = [...many(300, () => row(0.95)), ...many(1000, () => row(null, 'mancante', false))];
    expect(lowestThreshold(rows, { synthetic: false }).threshold).toBe(0);
  });

  it('fails on too few passing rows, on photos only', () => {
    const rows = many(299, () => row(0.95));
    expect(lowestThreshold(rows, { synthetic: false })).toMatchObject({
      threshold: null,
      failures: ['passing'],
    });
    expect(lowestThreshold(rows, { synthetic: true }).threshold).toBe(0);
  });

  it('fails when under 30% of the read rows pass, on photos only', () => {
    const rows = [...many(300, () => row(0.95)), ...many(701, () => row(0.5, 'giusta', false))];
    expect(lowestThreshold(rows, { synthetic: false })).toMatchObject({
      threshold: null,
      failures: ['share'],
    });
    expect(lowestThreshold(rows, { synthetic: true }).threshold).toBe(0);
  });

  it('fails when every threshold lets an error through', () => {
    const rows = [...many(300, () => row(0.95)), row(1, 'voce sbagliata')];
    expect(lowestThreshold(rows, { synthetic: false })).toEqual({
      threshold: null,
      failures: ['errors'],
      atErrorFree: null,
    });
  });

  it('on the synthetic corpus requires only no wrong value among the passing rows', () => {
    const rows = [row(0.95), row(0.96, 'range sbagliato'), row(0.8, 'valore sbagliato')];
    expect(lowestThreshold(rows, { synthetic: true }).threshold).toBe(0.81);
    expect(lowestThreshold(rows, { synthetic: false }).threshold).toBeNull();
    expect(lowestThreshold([...rows, row(0.9, 'in più')], { synthetic: true }).threshold).toBe(
      0.91,
    );
  });
});
