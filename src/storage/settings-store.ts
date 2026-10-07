import type { BloodioDb } from './db';
import { createEmitter } from './events';
import type { Settings, SettingsStore } from './types';

export const DEFAULT_SETTINGS: Settings = {
  language: 'it',
  theme: 'nero',
  unitSystem: 'conventional',
  preferredUnits: {},
  keepOriginalFile: false,
  disclaimerAcceptedAt: null,
  lastExportAt: null,
  dataChangedAt: null,
};

export function createSettingsStore(db: BloodioDb): SettingsStore {
  const emitter = createEmitter();
  return {
    async get(key) {
      const record = await db.settings.get(key);
      return record === undefined ? DEFAULT_SETTINGS[key] : (record.value as Settings[typeof key]);
    },
    async set(key, value) {
      await db.settings.put({ key, value });
      emitter.emit();
    },
    subscribe: emitter.subscribe,
  };
}
