import { describe, expect, it } from 'vitest';
import {
  assetsSize,
  OCR_CACHE,
  ocrAssetUrl,
  requiredAssets,
  type CoreBuild,
} from '../../src/ocr/assets';
import {
  createOcrOffline,
  type OcrOfflineEnv,
  type OcrOfflineStatus,
} from '../../src/pwa/ocr-offline';
import { FakeCache, fakeCaches } from '../fake-cache';

const BASE = 'https://app.test/';
const CORE: CoreBuild = 'tesseract-core-simd-lstm.wasm.js';
const URLS = requiredAssets(CORE).map((path) => ocrAssetUrl(path, BASE));
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
const activeWorker = () => Promise.resolve({} as ServiceWorkerRegistration);

/** Starts the download on a fake browser; seen collects every status reported. */
function start(overrides: Partial<OcrOfflineEnv> = {}, cache = new FakeCache()) {
  const opened: string[] = [];
  const env: OcrOfflineEnv = {
    registered: Promise.resolve(true),
    serviceWorker: { ready: activeWorker() },
    caches: fakeCaches(cache, opened),
    saveData: false,
    whenIdle: (run) => run(),
    pickCore: () => Promise.resolve(CORE),
    baseURI: BASE,
    ...overrides,
  };
  const offline = createOcrOffline(env);
  const seen: OcrOfflineStatus[] = [];
  offline.watch((status) => seen.push(status));
  return { offline, seen, cache, opened };
}

describe('createOcrOffline', () => {
  it('stays unsupported without a registered service worker or Cache Storage', async () => {
    for (const overrides of [
      { registered: Promise.resolve(false) },
      { serviceWorker: undefined },
      { caches: undefined },
    ]) {
      const { seen, cache } = start(overrides);
      await flush();
      expect(seen).toEqual(['unsupported']);
      expect(cache.added).toEqual([]);
    }
  });

  it('stays unsupported when Cache Storage refuses', async () => {
    const refused = {
      open: () => Promise.reject(new DOMException('blocked', 'SecurityError')),
    } as unknown as CacheStorage;
    const { seen } = start({ caches: refused });
    await flush();
    expect(seen).toEqual(['unsupported']);
  });

  it('is ready at once when the files are already cached', async () => {
    const cache = new FakeCache();
    cache.seed(...URLS);
    const { seen } = start({}, cache);
    await flush();
    expect(seen).toEqual(['unsupported', 'ready']);
    expect(cache.added).toEqual([]);
  });

  it('downloads the missing files into the OCR cache, one at a time, then is ready', async () => {
    const { seen, cache, opened } = start();
    await flush();
    expect(opened).toEqual([OCR_CACHE]);
    expect(cache.added).toEqual(URLS);
    expect(seen).toEqual(['unsupported', 'downloading', 'ready']);
  });

  it('resumes: only the missing files are downloaded', async () => {
    const cache = new FakeCache();
    cache.seed(URLS[0]!, URLS[1]!);
    const { seen } = start({}, cache);
    await flush();
    expect(cache.added).toEqual(URLS.slice(2));
    expect(seen.at(-1)).toBe('ready');
  });

  it('waits for the active service worker and an idle moment', async () => {
    let activate!: () => void;
    const ready = new Promise<ServiceWorkerRegistration>((resolve) => {
      activate = () => resolve({} as ServiceWorkerRegistration);
    });
    // Typed through `as`: a plain `= null` narrows idle to null, and idle!() would not compile.
    let idle = null as (() => void) | null;
    const { seen, cache } = start({
      serviceWorker: { ready },
      whenIdle: (run) => {
        idle = run;
      },
    });
    await flush();
    expect(idle).toBeNull();
    activate();
    await flush();
    expect(cache.added).toEqual([]);
    idle!();
    await flush();
    expect(cache.added).toEqual(URLS);
    expect(seen.at(-1)).toBe('ready');
  });

  it('with Save-Data and every file cached it is ready, not paused', async () => {
    const cache = new FakeCache();
    cache.seed(...URLS);
    const { seen } = start({ saveData: true }, cache);
    await flush();
    expect(seen).toEqual(['unsupported', 'ready']);
    expect(cache.added).toEqual([]);
  });

  it('pauses when the cache fails after the files are known, and download() retries', async () => {
    const cache = new FakeCache();
    cache.failMatch = () => new Error('cache gone');
    const { offline, seen } = start({}, cache);
    await flush();
    expect(seen.at(-1)).toBe('paused');
    cache.failMatch = null;
    offline.download();
    await flush();
    expect(cache.added).toEqual(URLS);
    expect(seen.at(-1)).toBe('ready');
  });

  it('does nothing on download() when ready', async () => {
    const { offline, seen, cache } = start();
    await flush();
    const before = [...seen];
    offline.download();
    await flush();
    expect(seen).toEqual(before);
    expect(cache.added).toEqual(URLS);
  });

  it('stays unsupported when no core can be picked', async () => {
    const { seen, cache } = start({ pickCore: () => Promise.reject(new Error('no wasm')) });
    await flush();
    expect(seen).toEqual(['unsupported']);
    expect(cache.added).toEqual([]);
  });

  it('with Save-Data it waits for download()', async () => {
    const { offline, seen, cache } = start({ saveData: true });
    await flush();
    expect(seen).toEqual(['unsupported', 'paused']);
    expect(cache.added).toEqual([]);
    offline.download();
    expect(seen.at(-1)).toBe('downloading');
    await flush();
    expect(cache.added).toEqual(URLS);
    expect(seen.at(-1)).toBe('ready');
  });

  it('pauses when a file fails, keeping what was saved, and download() resumes', async () => {
    const cache = new FakeCache();
    cache.failAdd = (url) => (url === URLS[2] ? new TypeError('Failed to fetch') : null);
    const { offline, seen } = start({}, cache);
    await flush();
    expect(seen.at(-1)).toBe('paused');
    expect([...cache.entries.keys()]).toEqual(URLS.slice(0, 2));
    cache.failAdd = null;
    offline.download();
    await flush();
    expect(cache.added).toEqual(URLS);
    expect(seen.at(-1)).toBe('ready');
  });

  it('pauses when the quota is full', async () => {
    const cache = new FakeCache();
    cache.failAdd = () => new DOMException('full', 'QuotaExceededError');
    const { seen } = start({}, cache);
    await flush();
    expect(seen).toEqual(['unsupported', 'downloading', 'paused']);
  });

  it('drops files of another hash or another core build, keeping the current ones', async () => {
    const cache = new FakeCache();
    const oldHash = `${BASE}ocr/00000000/worker.min.js`;
    const otherCore = ocrAssetUrl('core/tesseract-core-lstm.wasm.js', BASE);
    cache.seed(oldHash, otherCore, URLS[0]!);
    start({}, cache);
    await flush();
    expect(cache.entries.has(oldHash)).toBe(false);
    expect(cache.entries.has(otherCore)).toBe(false);
    expect(cache.added).toEqual(URLS.slice(1));
  });

  it('starts nothing more when download() is called while downloading', async () => {
    const cache = new FakeCache();
    let release!: () => void;
    cache.gate = new Promise<void>((resolve) => (release = resolve));
    const { offline, seen } = start({}, cache);
    await flush();
    expect(seen.at(-1)).toBe('downloading');
    offline.download();
    offline.download();
    release();
    await flush();
    expect(cache.added).toEqual(URLS);
    expect(seen).toEqual(['unsupported', 'downloading', 'ready']);
  });

  it('does nothing on download() before the files are known', async () => {
    const { offline, seen } = start({ registered: new Promise<boolean>(() => {}) });
    offline.download();
    await flush();
    expect(seen).toEqual(['unsupported']);
  });

  it('reports the current status to a late watcher, and stops once unwatched', async () => {
    const { offline } = start();
    await flush();
    const late: OcrOfflineStatus[] = [];
    const stop = offline.watch((status) => late.push(status));
    expect(late).toEqual(['ready']);
    stop();
    offline.download();
    await flush();
    expect(late).toEqual(['ready']);
  });

  it('gives the download size', () => {
    expect(start().offline.size()).toBe(assetsSize());
  });
});
