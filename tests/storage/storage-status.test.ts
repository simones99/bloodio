import { describe, expect, it } from 'vitest';
import { createStorageStatus } from '../../src/storage/storage-status';

describe('createStorageStatus', () => {
  it('reads persistence and usage, and asks for persistence', async () => {
    const status = createStorageStatus({
      persisted: () => Promise.resolve(false),
      estimate: () => Promise.resolve({ usage: 1234, quota: 1e9 }),
      persist: () => Promise.resolve(true),
    });
    expect(await status.get()).toEqual({ persisted: false, usage: 1234 });
    expect(await status.requestPersist()).toBe(true);
  });

  it('reports unknown and refuses when the browser has no storage API', async () => {
    const status = createStorageStatus(undefined);
    expect(await status.get()).toEqual({ persisted: null, usage: null });
    expect(await status.requestPersist()).toBe(false);
  });

  it('treats a failing API as unknown or refused', async () => {
    const status = createStorageStatus({
      persisted: () => Promise.reject(new Error('x')),
      estimate: () => Promise.reject(new Error('x')),
      persist: () => Promise.reject(new Error('x')),
    });
    expect(await status.get()).toEqual({ persisted: null, usage: null });
    expect(await status.requestPersist()).toBe(false);
  });
});
