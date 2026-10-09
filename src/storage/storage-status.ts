export interface StorageState {
  /** null when the browser does not say. */
  persisted: boolean | null;
  /** Bytes this origin uses; null when unknown. */
  usage: number | null;
}

export interface StorageStatus {
  get(): Promise<StorageState>;
  /** Asks the browser not to evict this origin's data. False when refused or unsupported. */
  requestPersist(): Promise<boolean>;
}

type StorageApi = Partial<Pick<StorageManager, 'persisted' | 'persist' | 'estimate'>>;

/** Wraps navigator.storage, which the UI never touches directly (tests pass a fake). */
export function createStorageStatus(storage: StorageApi | undefined): StorageStatus {
  return {
    async get() {
      const persisted = storage?.persisted ? await storage.persisted().catch(() => null) : null;
      const estimate = storage?.estimate ? await storage.estimate().catch(() => null) : null;
      return { persisted, usage: estimate?.usage ?? null };
    },
    async requestPersist() {
      if (!storage?.persist) return false;
      return storage.persist().catch(() => false);
    },
  };
}
