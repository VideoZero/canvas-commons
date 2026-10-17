import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest';

async function importFresh() {
  vi.resetModules();
  const core = await import('@canvas-commons/core');
  return {
    hasPromises: () => core.DependencyContext.hasPromises(),
    consumePromises: () => core.DependencyContext.consumePromises(),
    ...(await import('./fonts')),
  };
}

type FakeFace = {family: string; weight: string; style: string};

function face(family: string, weight = '400', style = 'normal'): FakeFace {
  return {family, weight, style};
}

describe('requestFontLoad', () => {
  let loaded: () => void;
  let faces: FakeFace[];
  const fonts = {
    addEventListener: vi.fn(),
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
    faces = [face('Inter'), face('"JetBrains Mono"'), face('not a font')];
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
    const {hasPromises, consumePromises, fontsVersion, requestFontLoad} =
      await importFresh();
    const version = fontsVersion();

    requestFontLoad('700 320px "JetBrains Mono"');
    expect(hasPromises()).toBe(true);

    const settled = vi.fn();
    const waiting = consumePromises().then(settled);
    await vi.waitFor(() =>
      expect(fonts.load).toHaveBeenCalledWith('700 320px "JetBrains Mono"'),
    );
    expect(settled).not.toHaveBeenCalled();

    loaded();
    await waiting;
    expect(fontsVersion()).toBe(version + 1);
  });

  test('requests each face once whatever its size', async () => {
    fonts.check.mockReturnValue(false);
    const {requestFontLoad} = await importFresh();

    requestFontLoad('16px Inter');
    requestFontLoad('32px Inter');
    expect(fonts.check).toHaveBeenCalledTimes(1);
  });

  test('does not wait for an available face', async () => {
    fonts.check.mockReturnValue(true);
    const {hasPromises, requestFontLoad} = await importFresh();

    requestFontLoad('16px Inter, monospace');
    expect(hasPromises()).toBe(false);
    expect(fonts.load).not.toHaveBeenCalled();
  });

  test('ignores an invalid font shorthand', async () => {
    fonts.check.mockImplementation(() => {
      throw new SyntaxError();
    });
    const {hasPromises, requestFontLoad} = await importFresh();

    expect(() => requestFontLoad('16px not a font')).not.toThrow();
    expect(hasPromises()).toBe(false);
  });

  test('looks at an undeclared family again once faces are declared', async () => {
    // `check` reports a family no stylesheet declares as available.
    fonts.check.mockReturnValue(true);
    const {hasPromises, requestFontLoad} = await importFresh();

    requestFontLoad('16px Fraunces');
    requestFontLoad('16px Fraunces');
    expect(fonts.check).toHaveBeenCalledTimes(1);

    faces.push(face('Fraunces'));
    fonts.check.mockReturnValue(false);
    requestFontLoad('16px Fraunces');
    requestFontLoad('16px Fraunces');
    expect(fonts.check).toHaveBeenCalledTimes(2);
    expect(hasPromises()).toBe(true);
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

    requestFontLoad('italic 600 16px "Fraunces", Inter, serif');
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
      faces.push(face('Fraunces', '400 500'));
    });
    setFontResolver(resolver);

    requestFontLoad('450 16px Fraunces');
    await consumePromises();
    expect(resolver).toHaveBeenCalledTimes(1);

    requestFontLoad('475.5 16px Fraunces');
    expect(resolver).toHaveBeenCalledTimes(1);

    requestFontLoad('italic 450 16px Fraunces');
    requestFontLoad('700 16px Fraunces');
    await consumePromises();
    expect(resolver).toHaveBeenCalledTimes(3);
  });

  test('keeps going when the resolver fails', async () => {
    fonts.check.mockReturnValue(false);
    fonts.load.mockResolvedValue([]);
    const {consumePromises, requestFontLoad, setFontResolver} =
      await importFresh();
    setFontResolver(() => Promise.reject(new Error('offline')));

    requestFontLoad('16px Fraunces');
    await consumePromises();
    expect(fonts.load).toHaveBeenCalled();
  });
});

describe('googleFontsResolver', () => {
  afterEach(() => {
    document.head.innerHTML = '';
  });

  function link(): HTMLLinkElement {
    const found = document.head.querySelector('link');
    if (!found) throw new Error('No stylesheet was requested.');
    return found;
  }

  function settle(event: 'load' | 'error') {
    const element = link();
    const handler = event === 'load' ? element.onload : element.onerror;
    handler?.call(element, new Event(event));
  }

  test('requests the weight and style in use', async () => {
    const {googleFontsResolver} = await importFresh();
    const loading = googleFontsResolver()({
      family: 'Playfair Display',
      weight: 700,
      style: 'italic',
    });

    expect(link().href).toBe(
      'https://fonts.googleapis.com/css2?display=block&family=Playfair+Display:ital,wght@1,700',
    );
    settle('load');
    await loading;
  });

  test('requests from a proxy when given a base URL', async () => {
    const {googleFontsResolver} = await importFresh();
    const loading = googleFontsResolver({
      baseUrl: 'https://engine.example/fonts/css2',
    })({family: 'Lato', weight: 400, style: 'normal'});

    expect(link().href).toBe(
      'https://engine.example/fonts/css2?display=block&family=Lato:ital,wght@0,400',
    );
    settle('load');
    await loading;
  });

  test('requests a weight between hundreds as a range', async () => {
    const {googleFontsResolver} = await importFresh();
    const loading = googleFontsResolver()({
      family: 'Inter',
      weight: 437.5,
      style: 'normal',
    });

    expect(link().href).toBe(
      'https://fonts.googleapis.com/css2?display=block&family=Inter:ital,wght@0,400..500',
    );
    settle('load');
    await loading;
  });

  test('falls back to the nearest hundred without the range', async () => {
    const {googleFontsResolver} = await importFresh();
    const loading = googleFontsResolver()({
      family: 'Lato',
      weight: 680,
      style: 'normal',
    });

    settle('error');
    await vi.waitFor(() =>
      expect(link().href).toBe(
        'https://fonts.googleapis.com/css2?display=block&family=Lato:ital,wght@0,700',
      ),
    );
    settle('load');
    await loading;
  });

  test('falls back to the regular face', async () => {
    const {googleFontsResolver} = await importFresh();
    const loading = googleFontsResolver()({
      family: 'Bungee',
      weight: 300,
      style: 'normal',
    });

    settle('error');
    await vi.waitFor(() =>
      expect(link().href).toBe(
        'https://fonts.googleapis.com/css2?display=block&family=Bungee',
      ),
    );
    settle('load');
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
