import { describe, expect, it, vi } from 'vitest';
import { registerServiceWorker, type RegisterEnv } from '../../src/pwa/register';

interface FakeOptions {
  prod?: boolean;
  supported?: boolean;
  protocol?: string;
  readyState?: DocumentReadyState;
  register?: () => Promise<unknown>;
}

/** A browser the test drives: load() fires the page's load event. */
function fakeBrowser(options: FakeOptions = {}) {
  const register = vi.fn(options.register ?? (() => Promise.resolve({})));
  const onLoad: Array<() => void> = [];
  const env: RegisterEnv = {
    prod: options.prod ?? true,
    serviceWorker:
      options.supported === false
        ? undefined
        : ({ register } as unknown as Pick<ServiceWorkerContainer, 'register'>),
    window: {
      addEventListener: ((type: string, listener: () => void) => {
        if (type === 'load') onLoad.push(listener);
      }) as unknown as Window['addEventListener'],
      location: { protocol: options.protocol ?? 'https:' },
      document: {
        baseURI: 'https://bloodio.test/bloodio/#/reports/3',
        readyState: options.readyState ?? 'complete',
      },
    },
  };
  return { env, register, load: () => onLoad.forEach((listener) => listener()) };
}

describe('registerServiceWorker', () => {
  it('registers sw.js next to the page, once the page has loaded', async () => {
    const browser = fakeBrowser({ readyState: 'interactive' });
    const result = registerServiceWorker(browser.env);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(browser.register).not.toHaveBeenCalled();
    browser.load();
    expect(await result).toBe(true);
    expect(browser.register).toHaveBeenCalledTimes(1);
    expect(browser.register).toHaveBeenCalledWith(new URL('https://bloodio.test/bloodio/sw.js'));
  });

  it('registers at once when the page has already loaded', async () => {
    const browser = fakeBrowser();
    expect(await registerServiceWorker(browser.env)).toBe(true);
    expect(browser.register).toHaveBeenCalledTimes(1);
  });

  it('skips development builds', async () => {
    const browser = fakeBrowser({ prod: false });
    expect(await registerServiceWorker(browser.env)).toBe(false);
    expect(browser.register).not.toHaveBeenCalled();
  });

  it('skips browsers without service workers', async () => {
    expect(await registerServiceWorker(fakeBrowser({ supported: false }).env)).toBe(false);
  });

  it('skips a build opened from the file system', async () => {
    const browser = fakeBrowser({ protocol: 'file:' });
    expect(await registerServiceWorker(browser.env)).toBe(false);
    expect(browser.register).not.toHaveBeenCalled();
  });

  it('accepts plain http, as on localhost', async () => {
    const browser = fakeBrowser({ protocol: 'http:' });
    expect(await registerServiceWorker(browser.env)).toBe(true);
    expect(browser.register).toHaveBeenCalledTimes(1);
  });

  it('resolves false when the browser refuses the registration', async () => {
    const browser = fakeBrowser({ register: () => Promise.reject(new Error('refused')) });
    expect(await registerServiceWorker(browser.env)).toBe(false);
  });
});
