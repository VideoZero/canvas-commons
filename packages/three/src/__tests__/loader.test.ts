/* eslint-disable @typescript-eslint/naming-convention -- Three.js export names */
import {describe, expect, test, vi} from 'vitest';
import type {ThreeModule} from '../loader';

type Loader = typeof import('../loader');

/**
 * The loader keeps module-level state, so every test starts from a fresh
 * copy of the module.
 */
async function freshLoader(): Promise<Loader> {
  vi.resetModules();
  return await import('../loader');
}

function fakeRuntime(tag: string): ThreeModule {
  return {tag} as unknown as ThreeModule;
}

describe('loader', () => {
  test('getThree throws until the runtime has loaded', async () => {
    const loader = await freshLoader();
    expect(loader.isThreeLoaded()).toBe(false);
    expect(loader.isThreeLoading()).toBe(false);
    expect(() => loader.getThree()).toThrow(/has not loaded yet/);
  });

  test('configureThree({module}) registers an already imported runtime', async () => {
    const loader = await freshLoader();
    const runtime = fakeRuntime('imported');
    loader.configureThree({module: runtime});
    expect(loader.isThreeLoaded()).toBe(true);
    expect(loader.isThreeLoading()).toBe(false);
    expect(loader.getThree()).toBe(runtime);
    await expect(loader.loadThree()).resolves.toBe(runtime);
  });

  test('loadThree joins one pending load and reports it as loading', async () => {
    const loader = await freshLoader();
    const runtime = fakeRuntime('esm');
    let calls = 0;
    loader.configureThree({
      load: async () => {
        calls++;
        return runtime;
      },
    });
    const first = loader.loadThree();
    expect(loader.isThreeLoading()).toBe(true);
    expect(loader.isThreeLoaded()).toBe(false);
    expect(loader.loadThree()).toBe(first);
    expect(await first).toBe(runtime);
    expect(calls).toBe(1);
    expect(loader.isThreeLoaded()).toBe(true);
    expect(loader.isThreeLoading()).toBe(false);
    expect(loader.getThree()).toBe(runtime);
  });

  test('a namespace that wraps the runtime in `default` is unwrapped', async () => {
    const loader = await freshLoader();
    const runtime = fakeRuntime('interop');
    loader.configureThree({
      load: async () => ({default: runtime}) as unknown as ThreeModule,
    });
    expect(await loader.loadThree()).toBe(runtime);
    expect(loader.getThree()).toBe(runtime);
  });

  test('a runtime that already loaded is kept by configureThree', async () => {
    const loader = await freshLoader();
    const first = fakeRuntime('first');
    loader.configureThree({module: first});
    loader.configureThree({module: fakeRuntime('second')});
    expect(loader.getThree()).toBe(first);
  });
});
