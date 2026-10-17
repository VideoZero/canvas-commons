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

  test('loadThreeAddon binds the addon factory to the loaded runtime, once', async () => {
    const loader = await freshLoader();
    const runtime = {REVISION: '186'} as unknown as ThreeModule;
    const requested: string[] = [];
    loader.configureThree({
      module: runtime,
      loadAddon: async (name, revision) => {
        requested.push(`${name}@r${revision}`);
        return {default: (three: ThreeModule) => ({SimplexNoise: three})};
      },
    });
    const first = await loader.loadThreeAddon('SimplexNoise');
    expect(first.SimplexNoise as unknown).toBe(runtime);
    expect(await loader.loadThreeAddon('SimplexNoise')).toBe(first);
    expect(requested).toEqual(['SimplexNoise@r186']);
  });

  test('a module without a default factory is returned as is', async () => {
    const loader = await freshLoader();
    const namespace = {SimplexNoise: class {}};
    loader.configureThree({
      module: fakeRuntime('x'),
      loadAddon: async () => namespace,
    });
    expect(await loader.loadThreeAddon('SimplexNoise')).toBe(namespace);
  });

  test('loadThreeAddon rejects unknown names and unconfigured hosts', async () => {
    const loader = await freshLoader();
    loader.configureThree({module: fakeRuntime('x')});
    await expect(loader.loadThreeAddon('Line2')).rejects.toThrow(
      /not available/,
    );
    loader.configureThree({loadAddon: async () => ({default: () => ({})})});
    await expect(
      loader.loadThreeAddon('OrbitControls' as never),
    ).rejects.toThrow(/Unknown Three.js addon/);
  });

  test('a failed addon fetch is retried on the next call', async () => {
    const loader = await freshLoader();
    let calls = 0;
    loader.configureThree({
      module: fakeRuntime('x'),
      loadAddon: async () => {
        if (calls++ === 0) throw new Error('offline');
        return {default: () => ({ok: true})};
      },
    });
    await expect(loader.loadThreeAddon('ImprovedNoise')).rejects.toThrow(
      'offline',
    );
    expect(await loader.loadThreeAddon('ImprovedNoise')).toEqual({ok: true});
  });
});
