import { useEffect, useState } from 'react';

export type Query<T> =
  { status: 'loading' } | { status: 'ready'; data: T } | { status: 'error'; error: unknown };

/**
 * Loads data from a store and reloads whenever the store says it changed.
 * `load` must be stable (wrap it in useCallback) or it reloads on every render.
 * Only the most recent load may set the state, so a slow earlier load can't overwrite newer data.
 */
export function useQuery<T>(
  load: () => Promise<T>,
  subscribe?: (listener: () => void) => () => void,
): Query<T> {
  const [state, setState] = useState<Query<T>>({ status: 'loading' });

  useEffect(() => {
    let alive = true;
    let latest = 0;
    const run = () => {
      const seq = ++latest;
      const current = () => alive && seq === latest;
      load().then(
        (data) => current() && setState({ status: 'ready', data }),
        (error: unknown) => current() && setState({ status: 'error', error }),
      );
    };
    run();
    const unsubscribe = subscribe?.(run);
    return () => {
      alive = false;
      unsubscribe?.();
    };
  }, [load, subscribe]);

  return state;
}
