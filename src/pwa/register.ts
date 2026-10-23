/** What registration needs from the browser; tests pass a fake. */
export interface RegisterEnv {
  prod: boolean;
  serviceWorker: Pick<ServiceWorkerContainer, 'register'> | undefined;
  window: Pick<Window, 'addEventListener'> & {
    location: Pick<Location, 'protocol'>;
    document: Pick<Document, 'baseURI' | 'readyState'>;
  };
}

function browserEnv(): RegisterEnv {
  // navigator.serviceWorker is undefined outside secure contexts, whatever the DOM types say.
  return { prod: import.meta.env.PROD, serviceWorker: navigator.serviceWorker, window };
}

/**
 * Registers the service worker that keeps Bloodio usable offline. Resolves true once it is
 * registered, false when skipped (development, file://, no support) or refused; never rejects.
 */
export async function registerServiceWorker(env: RegisterEnv = browserEnv()): Promise<boolean> {
  const { prod, serviceWorker, window } = env;
  if (!prod || !serviceWorker) return false;
  if (window.location.protocol !== 'http:' && window.location.protocol !== 'https:') return false;
  // After load, so precaching doesn't compete with the page's own first requests.
  if (window.document.readyState !== 'complete')
    await new Promise<void>((resolve) =>
      window.addEventListener('load', () => resolve(), { once: true }),
    );
  try {
    // Resolved against the page, so it works with base './' and with /bloodio/ on Pages.
    await serviceWorker.register(new URL('sw.js', window.document.baseURI));
    return true;
  } catch {
    return false;
  }
}
