import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest';

async function importFresh() {
  vi.resetModules();
  const core = await import('@motion-canvas/core');
  return {
    hasPromises: () => core.DependencyContext.hasPromises(),
    consumePromises: () => core.DependencyContext.consumePromises(),
    ...(await import('./fontLoading')),
  };
}

describe('requestFontLoad', () => {
  let loaded: () => void;
  const fonts = {
    check: vi.fn(),
    load: vi.fn(),
  };

  beforeEach(() => {
    fonts.load.mockImplementation(
      () => new Promise<void>(resolve => (loaded = resolve)),
    );
    Object.defineProperty(document, 'fonts', {
      value: fonts,
      configurable: true,
    });
  });

  afterEach(() => {
    Reflect.deleteProperty(document, 'fonts');
    vi.clearAllMocks();
  });

  test('makes the scene wait for a face that is not loaded', async () => {
    fonts.check.mockReturnValue(false);
    const {hasPromises, consumePromises, requestFontLoad} = await importFresh();

    requestFontLoad('"JetBrains Mono"', 700, 'normal');
    expect(fonts.load).toHaveBeenCalledWith('normal 700 16px "JetBrains Mono"');
    expect(hasPromises()).toBe(true);

    const settled = vi.fn();
    const waiting = consumePromises().then(settled);
    await Promise.resolve();
    expect(settled).not.toHaveBeenCalled();

    loaded();
    await waiting;
    expect(settled).toHaveBeenCalled();
  });

  test('requests each face once', async () => {
    fonts.check.mockReturnValue(false);
    const {requestFontLoad} = await importFresh();

    requestFontLoad('Inter', 400, 'normal');
    requestFontLoad('Inter', 400, 'normal');
    expect(fonts.check).toHaveBeenCalledTimes(1);
    expect(fonts.load).toHaveBeenCalledTimes(1);
  });

  test('does not wait for an available face', async () => {
    fonts.check.mockReturnValue(true);
    const {hasPromises, requestFontLoad} = await importFresh();

    requestFontLoad('monospace', 400, 'normal');
    expect(hasPromises()).toBe(false);
    expect(fonts.load).not.toHaveBeenCalled();
  });

  test('ignores an invalid font shorthand', async () => {
    fonts.check.mockImplementation(() => {
      throw new SyntaxError();
    });
    const {hasPromises, requestFontLoad} = await importFresh();

    expect(() => requestFontLoad('not a font', 400, 'normal')).not.toThrow();
    expect(hasPromises()).toBe(false);
  });
});
