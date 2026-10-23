import { describe, expect, it } from 'vitest';
import { OCR_ASSETS } from '../../scripts/ocr-assets.mjs';
import {
  assetsAvailable,
  assetsSize,
  CORE_BUILDS,
  coreFor,
  OCR_CACHE,
  ocrAssetUrl,
  pickCore,
  requiredAssets,
  type CoreBuild,
} from '../../src/ocr/assets';
import { FakeCache, fakeCaches } from '../fake-cache';

const BASE = 'https://app.test/bloodio/';
const CORE: CoreBuild = 'tesseract-core-simd-lstm.wasm.js';
const URLS = requiredAssets(CORE).map((path) => ocrAssetUrl(path, BASE));

describe('ocrAssetUrl', () => {
  it('resolves a file under the hashed folder, against the base', () => {
    expect(__OCR_HASH__).toMatch(/^[0-9a-f]{8}$/);
    expect(ocrAssetUrl('lang/ita.traineddata.gz', BASE)).toBe(
      `${BASE}ocr/${__OCR_HASH__}/lang/ita.traineddata.gz`,
    );
  });
});

describe('coreFor', () => {
  it.each([
    [{ simd: true, relaxedSimd: true }, 'tesseract-core-relaxedsimd-lstm.wasm.js'],
    [{ simd: true, relaxedSimd: false }, 'tesseract-core-simd-lstm.wasm.js'],
    [{ simd: false, relaxedSimd: false }, 'tesseract-core-lstm.wasm.js'],
  ])('with %o picks %s, as tesseract.js would', (support, build) => {
    expect(coreFor(support)).toBe(build);
  });
});

describe('pickCore', () => {
  it('picks one of the builds copied to ocr/', async () => {
    const copied = OCR_ASSETS.map((asset) => asset.to);
    expect(copied).toContain(`core/${await pickCore()}`);
  });
});

describe('requiredAssets', () => {
  it('lists the worker, the chosen core and the two models', () => {
    expect(requiredAssets(CORE)).toEqual([
      'worker.min.js',
      `core/${CORE}`,
      'lang/ita.traineddata.gz',
      'lang/eng.traineddata.gz',
    ]);
  });

  it('names only files that scripts/ocr-assets.mjs copies, for every build', () => {
    const copied = OCR_ASSETS.map((asset) => asset.to);
    for (const build of CORE_BUILDS) {
      for (const path of requiredAssets(build)) expect(copied).toContain(path);
    }
  });
});

describe('assetsSize', () => {
  it('adds the worker, the largest core build and the models', () => {
    const sizes = {
      'worker.min.js': 1,
      'core/tesseract-core-lstm.wasm.js': 10,
      'core/tesseract-core-simd-lstm.wasm.js': 30,
      'core/tesseract-core-relaxedsimd-lstm.wasm.js': 20,
      'lang/ita.traineddata.gz': 100,
      'lang/eng.traineddata.gz': 1000,
    };
    expect(assetsSize(sizes)).toBe(1131);
  });

  it('has a size for every file any build needs', () => {
    for (const build of CORE_BUILDS) {
      for (const path of requiredAssets(build)) expect(__OCR_SIZES__).toHaveProperty([path]);
    }
  });

  it('reads the real files’ sizes by default', () => {
    expect(assetsSize()).toBeGreaterThan(5 * 1024 * 1024);
  });
});

describe('assetsAvailable', () => {
  /** A network that answers HEAD with 200, or 404 for the failing URLs; it records each request. */
  function network(failing: string[] = []) {
    const heads: string[] = [];
    const methods: (string | undefined)[] = [];
    const fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      methods.push(init?.method);
      heads.push(String(input));
      return new Response(null, { status: failing.includes(String(input)) ? 404 : 200 });
    }) as typeof globalThis.fetch;
    return { heads, methods, fetch };
  }
  const allHead = (methods: (string | undefined)[]) => methods.every((m) => m === 'HEAD');

  it('trusts the cache when the service worker controls the page', async () => {
    const cache = new FakeCache();
    cache.seed(...URLS);
    const opened: string[] = [];
    const { heads, fetch } = network();
    const env = { controlled: true, caches: fakeCaches(cache, opened), fetch };
    expect(await assetsAvailable(URLS, env)).toBe(true);
    expect(heads).toEqual([]);
    expect(opened).toEqual([OCR_CACHE]);
    expect(cache.matchOptions).toHaveLength(URLS.length);
    expect(cache.matchOptions.every((o) => o?.ignoreVary === true)).toBe(true);
  });

  it('probes only the files missing from the cache', async () => {
    const cache = new FakeCache();
    cache.seed(...URLS.slice(1));
    const { heads, methods, fetch } = network();
    const env = { controlled: true, caches: fakeCaches(cache), fetch };
    expect(await assetsAvailable(URLS, env)).toBe(true);
    expect(heads).toEqual([URLS[0]]);
    expect(allHead(methods)).toBe(true);
  });

  it('is false when a file missing from the cache is missing from the network too', async () => {
    const cache = new FakeCache();
    cache.seed(...URLS.slice(1));
    const { fetch } = network([URLS[0]!]);
    const env = { controlled: true, caches: fakeCaches(cache), fetch };
    expect(await assetsAvailable(URLS, env)).toBe(false);
  });

  it('probes every file when no service worker controls the page, cached or not', async () => {
    const cache = new FakeCache();
    cache.seed(...URLS);
    const opened: string[] = [];
    const { heads, methods, fetch } = network();
    const env = { controlled: false, caches: fakeCaches(cache, opened), fetch };
    expect(await assetsAvailable(URLS, env)).toBe(true);
    expect(heads).toEqual(URLS);
    expect(allHead(methods)).toBe(true);
    expect(opened).toEqual([]);
  });

  it('probes every file without Cache Storage, or when it refuses', async () => {
    const { heads, methods, fetch } = network();
    expect(await assetsAvailable(URLS, { controlled: true, caches: undefined, fetch })).toBe(true);
    const refused = {
      open: () => Promise.reject(new DOMException('blocked', 'SecurityError')),
    } as unknown as CacheStorage;
    expect(await assetsAvailable(URLS, { controlled: true, caches: refused, fetch })).toBe(true);
    expect(heads).toEqual([...URLS, ...URLS]);
    expect(allHead(methods)).toBe(true);
  });

  it('is false when a file is missing or the network is down', async () => {
    const { fetch } = network([URLS[2]!]);
    expect(await assetsAvailable(URLS, { controlled: false, caches: undefined, fetch })).toBe(
      false,
    );
    const offline = (() => Promise.reject(new TypeError('Failed to fetch'))) as typeof fetch;
    expect(
      await assetsAvailable(URLS, { controlled: false, caches: undefined, fetch: offline }),
    ).toBe(false);
  });

  it('rejects, rather than reporting unavailable, when aborted during the probe', async () => {
    const controller = new AbortController();
    const reason = new DOMException('stop', 'AbortError');
    const fetch = (async () => {
      controller.abort(reason);
      throw reason;
    }) as unknown as typeof globalThis.fetch;
    await expect(
      assetsAvailable(URLS, {
        controlled: false,
        caches: undefined,
        fetch,
        signal: controller.signal,
      }),
    ).rejects.toBe(reason);
  });

  it('rejects without probing when already aborted', async () => {
    const controller = new AbortController();
    const reason = new DOMException('stop', 'AbortError');
    controller.abort(reason);
    const { heads, fetch } = network();
    await expect(
      assetsAvailable(URLS, {
        controlled: false,
        caches: undefined,
        fetch,
        signal: controller.signal,
      }),
    ).rejects.toBe(reason);
    expect(heads).toEqual([]);
  });
});
