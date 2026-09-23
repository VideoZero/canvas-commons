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
  let faces: {family: string; weight?: string; style?: string}[];
  const fonts = {
    check: vi.fn(),
    load: vi.fn(),
    get size() {
      return faces.length;
    },
    [Symbol.iterator]() {
      return faces[Symbol.iterator]();
    },
  };

  beforeEach(() => {
    faces = [
      {family: 'Inter'},
      {family: '"JetBrains Mono"'},
      {family: 'not a font'},
    ];
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
    expect(hasPromises()).toBe(true);

    const settled = vi.fn();
    const waiting = consumePromises().then(settled);
    await vi.waitFor(() =>
      expect(fonts.load).toHaveBeenCalledWith(
        'normal 700 16px "JetBrains Mono"',
      ),
    );
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
  });

  test('does not wait for an available face', async () => {
    fonts.check.mockReturnValue(true);
    const {hasPromises, requestFontLoad} = await importFresh();

    requestFontLoad('Inter, sans-serif', 400, 'normal');
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

  test('looks at an undeclared family again once faces are declared', async () => {
    fonts.check.mockReturnValue(true);
    const {requestFontLoad} = await importFresh();

    requestFontLoad('Fraunces', 400, 'normal');
    requestFontLoad('Fraunces', 400, 'normal');
    expect(fonts.check).toHaveBeenCalledTimes(1);

    faces.push({family: 'Fraunces'});
    fonts.check.mockReturnValue(false);
    requestFontLoad('Fraunces', 400, 'normal');
    requestFontLoad('Fraunces', 400, 'normal');
    expect(fonts.check).toHaveBeenCalledTimes(2);
  });

  test('asks the resolver for an undeclared family before loading', async () => {
    fonts.check.mockReturnValue(false);
    const {consumePromises, requestFontLoad, setFontResolver} =
      await importFresh();
    let declared: () => void = () => {};
    const resolver = vi.fn(
      () => new Promise<void>(resolve => (declared = resolve)),
    );
    setFontResolver(resolver);

    requestFontLoad('"Fraunces", Inter, serif', 600, 'italic');
    const waiting = consumePromises();
    await vi.waitFor(() =>
      expect(resolver).toHaveBeenCalledWith({
        family: 'Fraunces',
        weight: 600,
        style: 'italic',
      }),
    );
    expect(resolver).toHaveBeenCalledTimes(1);
    expect(fonts.load).not.toHaveBeenCalled();

    declared();
    await vi.waitFor(() => expect(fonts.load).toHaveBeenCalled());
    loaded();
    await waiting;
  });

  test('asks the resolver again for a weight its faces do not cover', async () => {
    fonts.check.mockReturnValue(false);
    fonts.load.mockResolvedValue([]);
    const {consumePromises, requestFontLoad, setFontResolver} =
      await importFresh();
    const resolver = vi.fn(() => {
      faces.push({family: 'Fraunces', weight: '400 500', style: 'normal'});
    });
    setFontResolver(resolver);

    requestFontLoad('Fraunces', 450, 'normal');
    await consumePromises();
    expect(resolver).toHaveBeenCalledTimes(1);

    requestFontLoad('Fraunces', 475.5, 'normal');
    expect(resolver).toHaveBeenCalledTimes(1);

    requestFontLoad('Fraunces', 450, 'italic');
    requestFontLoad('Fraunces', 700, 'normal');
    await consumePromises();
    expect(resolver).toHaveBeenCalledTimes(3);
  });

  test('keeps going when the resolver fails', async () => {
    fonts.check.mockReturnValue(false);
    fonts.load.mockResolvedValue([]);
    const {consumePromises, requestFontLoad, setFontResolver} =
      await importFresh();
    setFontResolver(() => Promise.reject(new Error('offline')));

    requestFontLoad('Fraunces', 400, 'normal');
    await consumePromises();
    expect(fonts.load).toHaveBeenCalled();
  });
});

describe('googleFontsResolver', () => {
  afterEach(() => {
    document.head.innerHTML = '';
  });

  test('requests the weight and style in use', async () => {
    const {googleFontsResolver} = await importFresh();
    const loading = googleFontsResolver()({
      family: 'Playfair Display',
      weight: 700,
      style: 'italic',
    });

    const link = document.head.querySelector('link')!;
    expect(link.href).toBe(
      'https://fonts.googleapis.com/css2?display=block&family=Playfair+Display:ital,wght@1,700',
    );
    link.onload!(new Event('load'));
    await loading;
  });

  test('requests a weight between hundreds as a range', async () => {
    const {googleFontsResolver} = await importFresh();
    const loading = googleFontsResolver()({
      family: 'Inter',
      weight: 437.5,
      style: 'normal',
    });

    const link = document.head.querySelector('link')!;
    expect(link.href).toBe(
      'https://fonts.googleapis.com/css2?display=block&family=Inter:ital,wght@0,400..500',
    );
    link.onload!(new Event('load'));
    await loading;
  });

  test('falls back to the nearest hundred without the range', async () => {
    const {googleFontsResolver} = await importFresh();
    const loading = googleFontsResolver()({
      family: 'Lato',
      weight: 680,
      style: 'normal',
    });

    document.head.querySelector('link')!.onerror!(new Event('error'));
    await vi.waitFor(() =>
      expect(document.head.querySelector('link')?.href).toBe(
        'https://fonts.googleapis.com/css2?display=block&family=Lato:ital,wght@0,700',
      ),
    );
    document.head.querySelector('link')!.onload!(new Event('load'));
    await loading;
  });

  test('falls back to the regular face', async () => {
    const {googleFontsResolver} = await importFresh();
    const loading = googleFontsResolver()({
      family: 'Bungee',
      weight: 300,
      style: 'normal',
    });

    document.head.querySelector('link')!.onerror!(new Event('error'));
    await vi.waitFor(() =>
      expect(document.head.querySelector('link')?.href).toBe(
        'https://fonts.googleapis.com/css2?display=block&family=Bungee',
      ),
    );
    document.head.querySelector('link')!.onload!(new Event('load'));
    await loading;
  });

  test('skips families outside the list', async () => {
    const {googleFontsResolver} = await importFresh();
    const result = googleFontsResolver({families: ['Inter']})({
      family: 'Arial',
      weight: 400,
      style: 'normal',
    });

    expect(result).toBeUndefined();
    expect(document.head.querySelector('link')).toBeNull();
  });
});
