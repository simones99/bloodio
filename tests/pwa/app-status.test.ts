import { describe, expect, it } from 'vitest';
import { createAppStatus, type AppEnv, type OfflineStatus } from '../../src/pwa/app-status';

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
const activeWorker = () => Promise.resolve({} as ServiceWorkerRegistration);

function env(overrides: Partial<AppEnv> = {}): AppEnv {
  return {
    registered: Promise.resolve(true),
    serviceWorker: { ready: activeWorker() },
    matchMedia: () => ({ matches: false }),
    standalone: undefined,
    ...overrides,
  };
}

describe('createAppStatus: installed', () => {
  it('is false in a browser tab', () => {
    expect(createAppStatus(env()).installed()).toBe(false);
    expect(createAppStatus(env({ matchMedia: undefined })).installed()).toBe(false);
  });

  it('is true when Safari on iOS says standalone', () => {
    expect(createAppStatus(env({ standalone: true })).installed()).toBe(true);
  });

  it('is true in the standalone display mode', () => {
    const matchMedia = (query: string) => ({ matches: query === '(display-mode: standalone)' });
    expect(createAppStatus(env({ matchMedia })).installed()).toBe(true);
  });
});

describe('createAppStatus: watchOffline', () => {
  it('reports preparing, then ready once the service worker is active', async () => {
    let activate!: () => void;
    const ready = new Promise<ServiceWorkerRegistration>((resolve) => {
      activate = () => resolve({} as ServiceWorkerRegistration);
    });
    const seen: OfflineStatus[] = [];
    createAppStatus(env({ serviceWorker: { ready } })).watchOffline((status) => seen.push(status));
    await flush();
    expect(seen).toEqual(['preparing']);
    activate();
    await flush();
    expect(seen).toEqual(['preparing', 'ready']);
  });

  it('reports nothing when the service worker did not register', async () => {
    const seen: OfflineStatus[] = [];
    createAppStatus(env({ registered: Promise.resolve(false) })).watchOffline((status) =>
      seen.push(status),
    );
    await flush();
    expect(seen).toEqual([]);
  });

  it('reports nothing without service worker support', async () => {
    const seen: OfflineStatus[] = [];
    createAppStatus(env({ serviceWorker: undefined })).watchOffline((status) => seen.push(status));
    await flush();
    expect(seen).toEqual([]);
  });

  it('stops reporting when cancelled mid-flight', async () => {
    let activate!: () => void;
    const ready = new Promise<ServiceWorkerRegistration>((resolve) => {
      activate = () => resolve({} as ServiceWorkerRegistration);
    });
    const seen: OfflineStatus[] = [];
    const stop = createAppStatus(env({ serviceWorker: { ready } })).watchOffline((status) =>
      seen.push(status),
    );
    await flush();
    expect(seen).toEqual(['preparing']);
    stop();
    activate();
    await flush();
    expect(seen).toEqual(['preparing']);
  });

  it('reports nothing while the registration is still pending', async () => {
    const seen: OfflineStatus[] = [];
    createAppStatus(env({ registered: new Promise<boolean>(() => {}) })).watchOffline((status) =>
      seen.push(status),
    );
    await flush();
    expect(seen).toEqual([]);
  });

  it('stops reporting once cancelled', async () => {
    const seen: OfflineStatus[] = [];
    const stop = createAppStatus(env()).watchOffline((status) => seen.push(status));
    stop();
    await flush();
    expect(seen).toEqual([]);
  });
});
