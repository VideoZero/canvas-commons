import {DependencyContext, useLogger} from '@canvas-commons/core';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {Icon} from '../Icon';
import {mockScene2D} from './mockScene2D';

const LOADED = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"/>';

function mockFetch(response: Partial<Response>) {
  const fetch = vi.fn(() =>
    Promise.resolve({
      ok: true,
      text: () => Promise.resolve(LOADED),
      ...response,
    }),
  );
  vi.stubGlobal('fetch', fetch);
  return fetch;
}

// The cache is shared by all icons, so every test uses icons of its own.
const ICONS = (function* () {
  for (let index = 0; ; index++) {
    yield `test:icon-${index}`;
  }
})();

function uniqueIcon() {
  return ICONS.next().value;
}

describe('Icon', () => {
  mockScene2D();

  beforeEach(async () => {
    await DependencyContext.consumePromises();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('lets a render wait for the icon and then draws it', async () => {
    mockFetch({});
    const icon = new Icon({icon: uniqueIcon()});

    expect(icon.svg()).not.toBe(LOADED);
    expect(DependencyContext.hasPromises()).toBe(true);

    await DependencyContext.consumePromises();

    expect(icon.svg()).toBe(LOADED);
  });

  it('loads the icon when awaited', async () => {
    mockFetch({});
    const icon = new Icon({icon: uniqueIcon()});

    await icon.toPromise();

    expect(icon.svg()).toBe(LOADED);
  });

  it('fetches an icon once for all nodes using it', async () => {
    const fetch = mockFetch({});
    const name = uniqueIcon();
    const first = new Icon({icon: name});
    const second = new Icon({icon: name});

    first.svg();
    second.svg();
    await DependencyContext.consumePromises();

    expect(first.svg()).toBe(LOADED);
    expect(second.svg()).toBe(LOADED);
    expect(fetch).toHaveBeenCalledOnce();
  });

  it('reports a missing icon once', async () => {
    const fetch = mockFetch({ok: false});
    const error = vi.spyOn(useLogger(), 'error');
    const icon = new Icon({icon: uniqueIcon()});

    icon.svg();
    await DependencyContext.consumePromises();
    const svg = icon.svg();

    expect(svg).not.toBe(LOADED);
    expect(DependencyContext.hasPromises()).toBe(false);
    expect(fetch).toHaveBeenCalledOnce();
    expect(error).toHaveBeenCalledOnce();
  });
});
