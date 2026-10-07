import { describe, expect, it } from 'vitest';
import { inferReportType, reportTypeMatchesFilter } from '../../src/domain/report-type';

describe('inferReportType', () => {
  it.each([
    [['blood', 'blood'], 'sangue'],
    [['urine'], 'urine'],
    [['blood', 'urine', null], 'misto'],
    [[null], 'altro'],
    [[], 'altro'],
  ] as const)('%j -> %s', (specimens, expected) => {
    expect(inferReportType([...specimens])).toBe(expected);
  });
});

describe('reportTypeMatchesFilter', () => {
  it('shows mixed reports under both blood and urine filters', () => {
    expect(reportTypeMatchesFilter('misto', 'urine')).toBe(true);
    expect(reportTypeMatchesFilter('misto', 'sangue')).toBe(true);
    expect(reportTypeMatchesFilter('misto', 'altro')).toBe(false);
    expect(reportTypeMatchesFilter('sangue', 'urine')).toBe(false);
    expect(reportTypeMatchesFilter('urine', 'urine')).toBe(true);
  });
});
