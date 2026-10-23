export type OfflineStatus = 'unsupported' | 'preparing' | 'ready';

export interface AppStatus {
  /** True when Bloodio runs as an installed app, opened from the Home screen. */
  installed(): boolean;
  /**
   * Reports 'preparing' once the service worker is registered, then 'ready' when it is active,
   * that is when its precache is complete. Reports nothing without offline support, so callers
   * start from 'unsupported'. If the service worker's install fails, 'ready' never comes on this
   * page; the browser retries on the next visit. Returns a function that stops the reports.
   */
  watchOffline(onChange: (status: OfflineStatus) => void): () => void;
}

/** What the status needs from the browser; the UI never touches navigator directly. */
export interface AppEnv {
  /** The outcome of registerServiceWorker. */
  registered: Promise<boolean>;
  serviceWorker: Pick<ServiceWorkerContainer, 'ready'> | undefined;
  matchMedia: ((query: string) => { matches: boolean }) | undefined;
  /** navigator.standalone, set by Safari on iOS only. */
  standalone: boolean | undefined;
}

export function createAppStatus(env: AppEnv): AppStatus {
  return {
    installed: () =>
      env.standalone === true || (env.matchMedia?.('(display-mode: standalone)').matches ?? false),
    watchOffline(onChange) {
      let live = true;
      const report = (status: OfflineStatus) => {
        if (live) onChange(status);
      };
      void env.registered.then(async (registered) => {
        if (!registered || !env.serviceWorker) return;
        report('preparing');
        await env.serviceWorker.ready;
        report('ready');
      });
      return () => {
        live = false;
      };
    },
  };
}
