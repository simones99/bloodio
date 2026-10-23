/** An in-memory Cache: the part of the Cache API the OCR code uses. */
export class FakeCache {
  readonly entries = new Map<string, Response>();
  /** Every URL add() saved, in order. */
  readonly added: string[] = [];
  /** Returns the error add() throws for a URL, as the network or a full quota would; null saves it. */
  failAdd: ((url: string) => Error | null) | null = null;
  /** Returns the error match() rejects with, as a cache that went away would; null answers. */
  failMatch: (() => Error | null) | null = null;
  /** While set, add() waits for it: a download still in flight. */
  gate: Promise<void> | null = null;
  /** The options every match() call received. */
  readonly matchOptions: (CacheQueryOptions | undefined)[] = [];

  /** Puts files in the cache as if an earlier download had saved them. */
  seed(...urls: string[]): void {
    for (const url of urls) this.entries.set(url, new Response('ok'));
  }

  async match(
    request: RequestInfo | URL,
    options?: CacheQueryOptions,
  ): Promise<Response | undefined> {
    this.matchOptions.push(options);
    const error = this.failMatch?.();
    if (error) throw error;
    return this.entries.get(urlOf(request));
  }

  async keys(): Promise<Request[]> {
    return [...this.entries.keys()].map((url) => new Request(url));
  }

  async delete(request: RequestInfo | URL): Promise<boolean> {
    return this.entries.delete(urlOf(request));
  }

  async add(request: RequestInfo | URL): Promise<void> {
    if (this.gate) await this.gate;
    const url = urlOf(request);
    const error = this.failAdd?.(url);
    if (error) throw error;
    this.added.push(url);
    this.entries.set(url, new Response('ok'));
  }
}

const urlOf = (request: RequestInfo | URL) =>
  typeof request === 'string' ? request : request instanceof URL ? request.href : request.url;

/** A CacheStorage holding one cache; the names asked for go in opened. */
export function fakeCaches(cache: FakeCache, opened: string[] = []): CacheStorage {
  return {
    open: async (name: string) => {
      opened.push(name);
      return cache as unknown as Cache;
    },
  } as unknown as CacheStorage;
}
