import {describe, expect, it, vi} from 'vitest';
import {ResourceCache} from './ResourceCache';

describe('ResourceCache', () => {
  it('fetches a resource once', async () => {
    const cache = new ResourceCache<string>();
    const fetch = vi.fn(() => Promise.resolve('value'));

    const [first, second] = await Promise.all([
      cache.request('key', fetch),
      cache.request('key', fetch),
    ]);
    const third = await cache.request('key', fetch);

    expect([first, second, third]).toEqual(['value', 'value', 'value']);
    expect(fetch).toHaveBeenCalledOnce();
  });

  it('returns a fetched resource synchronously', async () => {
    const cache = new ResourceCache<string>();
    expect(cache.has('key')).toBe(false);
    expect(cache.get('key')).toBeUndefined();

    await cache.request('key', () => Promise.resolve('value'));

    expect(cache.has('key')).toBe(true);
    expect(cache.get('key')).toBe('value');
  });

  it('forgets a failed fetch', async () => {
    const cache = new ResourceCache<string>();

    await expect(
      cache.request('key', () => Promise.reject(new Error('offline'))),
    ).rejects.toThrow('offline');

    expect(cache.has('key')).toBe(false);
    await expect(
      cache.request('key', () => Promise.resolve('value')),
    ).resolves.toBe('value');
  });
});
