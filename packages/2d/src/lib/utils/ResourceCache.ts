/**
 * A cache of asynchronous resources that shares the requests in flight.
 *
 * @remarks
 * A resource is fetched once per key. Requesting a key whose fetch is still
 * pending returns the same promise, and a fetch that fails is forgotten so the
 * next request tries again.
 *
 * @example
 * ```ts
 * const cache = new ResourceCache<string>();
 *
 * const text = cache.get(url) ?? (await cache.request(url, () =>
 *   fetch(url).then(response => response.text()),
 * ));
 * ```
 *
 * @typeParam T - The type of the cached resource.
 */
export class ResourceCache<T> {
  private readonly cached = new Map<string, {value: T}>();
  private readonly pending = new Map<string, Promise<T>>();

  /**
   * Check whether the resource for the given key has been fetched.
   *
   * @param key - The key of the resource.
   */
  public has(key: string): boolean {
    return this.cached.has(key);
  }

  /**
   * Get the fetched resource for the given key.
   *
   * @param key - The key of the resource.
   * @returns The resource, or `undefined` if it has not been fetched yet.
   */
  public get(key: string): T | undefined {
    return this.cached.get(key)?.value;
  }

  /**
   * Get the resource for the given key, fetching it if needed.
   *
   * @param key - The key of the resource.
   * @param fetch - Fetches the resource when it is neither cached nor pending.
   */
  public request(key: string, fetch: () => Promise<T>): Promise<T> {
    const cached = this.cached.get(key);
    if (cached) {
      return Promise.resolve(cached.value);
    }

    const pending = this.pending.get(key);
    if (pending) {
      return pending;
    }

    const promise = fetch().then(
      value => {
        this.cached.set(key, {value});
        this.pending.delete(key);
        return value;
      },
      (error: unknown) => {
        this.pending.delete(key);
        throw error;
      },
    );
    this.pending.set(key, promise);
    return promise;
  }
}
