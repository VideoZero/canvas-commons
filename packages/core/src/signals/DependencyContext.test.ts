import {afterEach, describe, expect, test} from 'vitest';
import {DependencyContext} from '.';

describe('DependencyContext.isolatePromises()', () => {
  afterEach(() => DependencyContext.consumePromises());

  test('hides the outer promises from the callback', async () => {
    let resolveOuter = () => {};
    const outer = new Promise<void>(resolve => (resolveOuter = resolve));
    DependencyContext.collectPromise(outer);

    const result = await DependencyContext.isolatePromises(async () => {
      expect(DependencyContext.hasPromises()).toBe(false);
      DependencyContext.collectPromise(Promise.resolve());
      const consumed = await DependencyContext.consumePromises();
      expect(consumed).toHaveLength(1);
      return 'done';
    });

    expect(result).toBe('done');
    expect(DependencyContext.hasPromises()).toBe(true);
    resolveOuter();
    const consumed = await DependencyContext.consumePromises();
    expect(consumed.map(({promise}) => promise)).toEqual([outer]);
  });

  test('hands unconsumed promises back to the outer collection', async () => {
    const inner = Promise.resolve();
    await DependencyContext.isolatePromises(async () => {
      DependencyContext.collectPromise(inner);
    });

    const consumed = await DependencyContext.consumePromises();
    expect(consumed.map(({promise}) => promise)).toEqual([inner]);
  });

  test('restores the outer promises when the callback throws', async () => {
    const outer = Promise.resolve();
    DependencyContext.collectPromise(outer);

    await expect(
      DependencyContext.isolatePromises(async () => {
        throw new Error('failed');
      }),
    ).rejects.toThrow('failed');

    const consumed = await DependencyContext.consumePromises();
    expect(consumed.map(({promise}) => promise)).toEqual([outer]);
  });
});
