/**
 * A simple cache for async resources that deduplicates parallel fetches.
 *
 * @remarks
 * The caller provides both the cache key and the fetch promise.
 * If the value is already cached, it is returned synchronously.
 * If a fetch for the same key is already in flight, the existing promise
 * is reused instead of starting a duplicate request.
 *
 * @typeParam T - The type of the cached resource.
 */
export class ResourceCache<T> {
  private cached = new Map<string, T>();
  private pending = new Map<string, Promise<T>>();

  /**
   * Check if a value is cached for the given key.
   */
  public has(key: string): boolean {
    return this.cached.has(key);
  }

  /**
   * Get a cached value synchronously, or `undefined` if not cached.
   */
  public get(key: string): T | undefined {
    return this.cached.get(key);
  }

  /**
   * Request a resource by key. If cached, returns immediately.
   * If a fetch is already pending for this key, reuses that promise.
   * Otherwise, calls `fetch()` and caches the result.
   *
   * @param key - The cache key.
   * @param fetch - A function that returns a promise resolving to the value.
   * @returns A promise that resolves to the cached or fetched value.
   */
  public async request(key: string, fetch: () => Promise<T>): Promise<T> {
    if (this.cached.has(key)) {
      return this.cached.get(key)!;
    }

    if (this.pending.has(key)) {
      return this.pending.get(key)!;
    }

    const promise = fetch().then(value => {
      this.cached.set(key, value);
      this.pending.delete(key);
      return value;
    });

    this.pending.set(key, promise);
    return promise;
  }
}
