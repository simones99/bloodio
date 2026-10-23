// The OCR files the app serves under ocr/<hash>/ (scripts/copy-ocr-assets.mjs), shared by the
// engine and by the background download that makes OCR work offline (src/pwa/ocr-offline.ts).

export const CORE_BUILDS = [
  'tesseract-core-relaxedsimd-lstm.wasm.js',
  'tesseract-core-simd-lstm.wasm.js',
  'tesseract-core-lstm.wasm.js',
] as const;

/** tesseract.js's LSTM-only builds of its WASM core; the device's SIMD support picks one. */
export type CoreBuild = (typeof CORE_BUILDS)[number];
/** The worker script, by path under ocr/<hash>/. */
export const OCR_WORKER = 'worker.min.js';
/** The folder of the language models, by path under ocr/<hash>/. */
export const OCR_LANG_DIR = 'lang';
/** The models tesseract reads with, Italian first. */
export const OCR_LANGUAGES = 'ita+eng';
/** tesseract.js's OEM.LSTM_ONLY: the neural engine alone, which the 4.0.0_best_int models need. */
export const OCR_ENGINE_MODE = 1;
const MODELS = [`${OCR_LANG_DIR}/ita.traineddata.gz`, `${OCR_LANG_DIR}/eng.traineddata.gz`];

/**
 * The Cache Storage cache the page fills and the service worker only reads (vite.config.ts).
 * vite.config.ts imports this module: nothing at its top level may touch browser globals
 * (document, __OCR_HASH__).
 * Renaming it orphans the old cache (about 8 MB): cleanupOutdatedCaches only handles precaches,
 * so a rename needs code that deletes the old name.
 */
export const OCR_CACHE = 'bloodio-ocr';

/**
 * How the OCR cache is matched: the files are content-hashed, so Vary means nothing. The service
 * worker route matches the same way (vite.config.ts).
 */
export const OCR_MATCH: Readonly<CacheQueryOptions> = { ignoreVary: true };

/** The URL of an OCR file, given by its path under ocr/<hash>/. */
export function ocrAssetUrl(path: string, baseURI: string = document.baseURI): string {
  return new URL(`ocr/${__OCR_HASH__}/${path}`, baseURI).href;
}

/** tesseract.js's own choice for the LSTM-only engine: relaxed SIMD, then SIMD, then neither. */
export function coreFor(support: { simd: boolean; relaxedSimd: boolean }): CoreBuild {
  if (support.relaxedSimd) return 'tesseract-core-relaxedsimd-lstm.wasm.js';
  if (support.simd) return 'tesseract-core-simd-lstm.wasm.js';
  return 'tesseract-core-lstm.wasm.js';
}

/**
 * The core build this device runs. The engine hands it to tesseract.js as a file, which then skips
 * its own detection: the build the background download cached is the one the reading loads.
 */
export async function pickCore(): Promise<CoreBuild> {
  const { relaxedSimd, simd } = await import('wasm-feature-detect');
  const [hasSimd, hasRelaxedSimd] = await Promise.all([simd(), relaxedSimd()]);
  return coreFor({ simd: hasSimd, relaxedSimd: hasRelaxedSimd });
}

/** The files a reading loads, by path under ocr/<hash>/. */
export function requiredAssets(core: CoreBuild): string[] {
  return [OCR_WORKER, `core/${core}`, ...MODELS];
}

/**
 * The bytes a device downloads. With the largest core build: the three differ by about 10 KB,
 * which rounding to 0.1 MB hides, and the size is known without detecting the device's support.
 */
export function assetsSize(sizes: Readonly<Record<string, number>> = __OCR_SIZES__): number {
  const size = (path: string) => sizes[path] ?? 0;
  const core = Math.max(...CORE_BUILDS.map((build) => size(`core/${build}`)));
  return size(OCR_WORKER) + core + MODELS.reduce((sum, model) => sum + size(model), 0);
}

/** The URLs not in the cache. */
export async function missingFromCache(cache: Cache, urls: readonly string[]): Promise<string[]> {
  const missing: string[] = [];
  for (const url of urls) if (!(await cache.match(url, OCR_MATCH))) missing.push(url);
  return missing;
}

export interface AvailabilityEnv {
  /** Whether a service worker controls the page: only then do its requests reach the cache. */
  controlled: boolean;
  caches: CacheStorage | undefined;
  fetch: typeof fetch;
  signal?: AbortSignal;
}

/**
 * Whether every file can load: from the cache when the service worker controls the page and holds
 * it, otherwise from the network, probed with HEAD. The service worker serves only GET from the
 * cache, and an uncontrolled page does not reach it at all.
 */
export async function assetsAvailable(
  urls: readonly string[],
  env: AvailabilityEnv,
): Promise<boolean> {
  env.signal?.throwIfAborted();
  let probe = [...urls];
  if (env.controlled && env.caches) {
    try {
      probe = await missingFromCache(await env.caches.open(OCR_CACHE), urls);
    } catch {
      // Cache Storage refused (private mode, blocked storage): the network is the only source.
    }
  }
  const probes = await Promise.all(
    probe.map((url) => env.fetch(url, { method: 'HEAD', signal: env.signal }).catch(() => null)),
  );
  env.signal?.throwIfAborted();
  return probes.every((response) => response?.ok === true);
}
