export type Listener = () => void;

export interface Emitter {
  emit(): void;
  /** Returns the function that removes the listener. */
  subscribe(listener: Listener): () => void;
}

export function createEmitter(): Emitter {
  const listeners = new Set<Listener>();
  return {
    emit: () => listeners.forEach((listener) => listener()),
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
