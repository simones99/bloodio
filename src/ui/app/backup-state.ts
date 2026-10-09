/** After this many days without an export, the Home reminds to export pending data. */
export const BACKUP_REMIND_DAYS = 90;
/** How long "Più tardi" hides the Home reminder. */
export const BACKUP_SNOOZE_DAYS = 30;

const DAY_MS = 86_400_000;

export interface BackupState {
  /** ISO timestamp of the last export the user actually received, or null. */
  lastExportAt: string | null;
  /** Some data changed after the last export, or there never was one. */
  pending: boolean;
  /** The Home should remind to export: pending, stale or never exported, and not snoozed. */
  remind: boolean;
}

export interface BackupInput {
  lastExportAt: string | null;
  dataChangedAt: string | null;
  snoozedUntil?: string | null;
  now?: Date;
}

/** Milliseconds of an ISO timestamp, or null when it is missing or unreadable. */
function time(timestamp: string | null): number | null {
  if (timestamp === null) return null;
  const ms = Date.parse(timestamp);
  return Number.isNaN(ms) ? null : ms;
}

/** Whether the device holds data that no export file contains. Settings and Home use it. */
export function backupState({
  lastExportAt,
  dataChangedAt,
  snoozedUntil = null,
  now = new Date(),
}: BackupInput): BackupState {
  const exported = time(lastExportAt);
  const changed = time(dataChangedAt);
  const snoozed = time(snoozedUntil);
  const pending = changed !== null && (exported === null || changed > exported);
  const stale = exported === null || now.getTime() - exported > BACKUP_REMIND_DAYS * DAY_MS;
  const awake = snoozed === null || now.getTime() > snoozed;
  return { lastExportAt, pending, remind: pending && stale && awake };
}

/** The end of a "Più tardi" pressed at `now`, as stored in `backupReminderSnoozedUntil`. */
export function snoozeUntil(now: Date): string {
  return new Date(now.getTime() + BACKUP_SNOOZE_DAYS * DAY_MS).toISOString();
}

/** "2026-10-08" in the device's time zone. */
export function localDay(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** The local day of an ISO timestamp, or null when it is not a valid date. */
export function dayOf(timestamp: string): string | null {
  const date = new Date(timestamp);
  return Number.isNaN(date.getTime()) ? null : localDay(date);
}

export const exportFileName = (date: Date) => `bloodio-${localDay(date)}.json`;
