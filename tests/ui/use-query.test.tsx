// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useQuery } from '../../src/ui/app/use-query';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}

describe('useQuery', () => {
  it('keeps the newest load when an older one resolves after it', async () => {
    const first = deferred<string>();
    const second = deferred<string>();
    const pending = [first, second];
    const load = () => pending.shift()!.promise;
    let notify = () => {};
    const subscribe = (listener: () => void) => {
      notify = listener;
      return () => {};
    };

    const { result } = renderHook(() => useQuery(load, subscribe));
    act(() => notify());
    await act(async () => second.resolve('nuovo'));
    await act(async () => first.resolve('vecchio'));

    await waitFor(() => expect(result.current).toEqual({ status: 'ready', data: 'nuovo' }));
  });
});
