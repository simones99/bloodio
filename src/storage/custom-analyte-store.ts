import type { CustomAnalyte } from '../domain/types';
import type { BloodioDb } from './db';
import type { CustomAnalyteStore } from './types';

export function createCustomAnalyteStore(db: BloodioDb): CustomAnalyteStore {
  return {
    list: () => db.customAnalytes.orderBy('name').toArray(),

    async create(input) {
      const name = input.name.trim();
      if (name === '') throw new Error('Custom analyte name is empty');
      const analyte: CustomAnalyte = { ...input, name, id: crypto.randomUUID() };
      await db.customAnalytes.add(analyte);
      return analyte;
    },

    async rename(id, name) {
      const trimmed = name.trim();
      if (trimmed === '') throw new Error('Custom analyte name is empty');
      const updated = await db.customAnalytes.update(id, { name: trimmed });
      if (updated === 0) throw new Error(`Custom analyte not found: ${id}`);
    },

    async remove(id) {
      await db.transaction('rw', [db.customAnalytes, db.measurements], async () => {
        const inUse = await db.measurements.where('customAnalyteId').equals(id).count();
        if (inUse > 0) throw new Error(`Custom analyte still has ${inUse} measurements`);
        await db.customAnalytes.delete(id);
      });
    },
  };
}
