import {
  assetsSize,
  missingFromCache,
  OCR_CACHE,
  ocrAssetUrl,
  requiredAssets,
  type CoreBuild,
} from '../ocr/assets';

export type OcrOfflineStatus = 'unsupported' | 'downloading' | 'ready' | 'paused';

export interface OcrOffline {
  /**
   * Reports the current status at once, then every change. Returns a function that stops the
   * reports.
   */
  watch(onChange: (status: OcrOfflineStatus) => void): () => void;
  /** Starts or resumes the download, Save-Data or not. Does nothing unless paused. */
  download(): void;
  /** The bytes a device downloads. */
  size(): number;
}

/** What the download needs from the browser; tests pass a fake. */
export interface OcrOfflineEnv {
  /** The outcome of registerServiceWorker: without a service worker the cache serves nothing. */
  registered: Promise<boolean>;
  serviceWorker: Pick<ServiceWorkerContainer, 'ready'> | undefined;
  caches: CacheStorage | undefined;
  /** navigator.connection.saveData: the device asks to spare data, so nothing starts by itself. */
  saveData: boolean;
  /**
   * Runs once the browser is idle: requestIdleCallback, or a timeout where it is missing
   * (Safari).
   */
  whenIdle(run: () => void): void;
  pickCore(): Promise<CoreBuild>;
  baseURI: string;
}

interface Target {
  cache: Cache;
  urls: string[];
}

/**
 * Downloads in the background the OCR files this device needs into the cache the service worker
 * serves them from (vite.config.ts), so reading photos and scans works offline. Starts by itself.
 */
export function createOcrOffline(env: OcrOfflineEnv): OcrOffline {
  let status: OcrOfflineStatus = 'unsupported';
  const listeners = new Set<(status: OcrOfflineStatus) => void>();
  /** Known once the cache is open; download() does nothing before. */
  let target: Target | null = null;
  let running = false;

  const report = (next: OcrOfflineStatus) => {
    status = next;
    for (const listener of listeners) listener(next);
  };

  async function fetchMissing({ cache, urls }: Target) {
    running = true;
    let complete = false;
    try {
      report('downloading');
      try {
        // One at a time: a model is a few MB, and a download cut short keeps what it saved. Through
        // the service worker when it controls the page: its read-only route fetches, the page
        // stores.
        for (const url of await missingFromCache(cache, urls)) await cache.add(url);
      } catch {
        // Offline, a failed response or a full quota: what is saved stays, the rest waits.
      }
      try {
        complete = (await missingFromCache(cache, urls)).length === 0;
      } catch {
        // The cache went away: paused, like any other failure.
      }
    } finally {
      running = false;
    }
    report(complete ? 'ready' : 'paused');
  }

  async function start() {
    if (!(await env.registered) || !env.serviceWorker || !env.caches) return;
    // After the app's own precache, and away from the first render.
    await env.serviceWorker.ready;
    await new Promise<void>((resolve) => env.whenIdle(resolve));
    const urls = requiredAssets(await env.pickCore()).map((path) => ocrAssetUrl(path, env.baseURI));
    const cache = await env.caches.open(OCR_CACHE);
    // Files of an older hash or of another core build. An old tab still open (after a hard reload
    // here, say) loses offline OCR, but never loads files of another version: the hash is in the
    // URL.
    for (const request of await cache.keys()) {
      if (!urls.includes(request.url)) await cache.delete(request);
    }
    target = { cache, urls };
    if ((await missingFromCache(cache, urls)).length === 0) report('ready');
    else if (env.saveData) report('paused');
    else await fetchMissing(target);
  }

  void start().catch(() => {
    // Before the files are known (Cache Storage refused, no core): OCR keeps needing the network.
    // After: paused, and download() retries.
    if (target && !running) report('paused');
  });

  return {
    watch(onChange) {
      listeners.add(onChange);
      onChange(status);
      return () => {
        listeners.delete(onChange);
      };
    },
    download() {
      // A throwing listener must not become an unhandled rejection.
      if (target && !running && status === 'paused') void fetchMissing(target).catch(() => {});
    },
    size: () => assetsSize(),
  };
}
