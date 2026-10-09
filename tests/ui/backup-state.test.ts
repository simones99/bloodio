import { describe, expect, it } from 'vitest';
import {
  backupState,
  dayOf,
  exportFileName,
  localDay,
  snoozeUntil,
} from '../../src/ui/app/backup-state';

const NOW = new Date('2026-10-09T10:00:00.000Z');
const DAY_MS = 86_400_000;
const daysAgo = (n: number) => new Date(NOW.getTime() - n * DAY_MS).toISOString();
const state = (
  lastExportAt: string | null,
  dataChangedAt: string | null,
  snoozedUntil: string | null = null,
) => backupState({ lastExportAt, dataChangedAt, snoozedUntil, now: NOW });

describe('backupState', () => {
  it('has nothing pending and no reminder without data', () => {
    expect(state(null, null)).toEqual({ lastExportAt: null, pending: false, remind: false });
  });

  it('is pending and reminds when data exist and were never exported', () => {
    expect(state(null, daysAgo(1))).toMatchObject({ pending: true, remind: true });
  });

  it('is pending only when data changed after the last export', () => {
    expect(state(daysAgo(10), daysAgo(11)).pending).toBe(false);
    expect(state(daysAgo(10), daysAgo(9)).pending).toBe(true);
  });

  it('reminds only when the last export is older than 90 days', () => {
    expect(state(daysAgo(89), daysAgo(1)).remind).toBe(false);
    expect(state(daysAgo(91), daysAgo(1)).remind).toBe(true);
  });

  it('does not remind when nothing changed after an old export', () => {
    expect(state(daysAgo(200), daysAgo(201)).remind).toBe(false);
  });

  it('stays quiet while snoozed and comes back once the snooze is over', () => {
    expect(state(null, daysAgo(1), snoozeUntil(new Date(NOW.getTime() - DAY_MS))).remind).toBe(
      false,
    );
    expect(state(null, daysAgo(1), daysAgo(1)).remind).toBe(true);
  });

  it('treats unreadable timestamps as missing', () => {
    expect(state('x', daysAgo(1))).toMatchObject({ pending: true, remind: true });
    expect(state(null, daysAgo(1), 'x').remind).toBe(true);
  });
});

describe('snoozeUntil', () => {
  it('is 30 days later', () => {
    expect(snoozeUntil(NOW)).toBe('2026-11-08T10:00:00.000Z');
  });
});

describe('dates', () => {
  it('writes the local day and names the export file after it', () => {
    const date = new Date(2026, 9, 8, 23, 30);
    expect(localDay(date)).toBe('2026-10-08');
    expect(exportFileName(date)).toBe('bloodio-2026-10-08.json');
  });

  it('reads the local day of a timestamp, or null when it is not one', () => {
    expect(dayOf(new Date(2026, 0, 2, 12).toISOString())).toBe('2026-01-02');
    expect(dayOf('x')).toBeNull();
  });
});
