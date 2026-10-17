import {DependencyContext} from '@canvas-commons/core';
import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';
import {Code} from '../Code';
import {mockScene2D} from './mockScene2D';
import {mockTextContext} from './mockTextContext';
import {add} from './sceneFixtures';

describe('Code fonts', () => {
  mockScene2D();
  mockTextContext();

  const fonts = {
    addEventListener: vi.fn(),
    check: vi.fn(() => false),
    load: vi.fn(() => Promise.resolve([])),
    size: 0,
    [Symbol.iterator]: () => [][Symbol.iterator](),
  };

  beforeAll(() => {
    Object.defineProperty(document, 'fonts', {
      value: fonts,
      configurable: true,
    });
  });

  afterAll(() => {
    Reflect.deleteProperty(document, 'fonts');
  });

  it('waits for the web font it measures with', async () => {
    const code = new Code({code: 'const a = 1;', fontFamily: 'Code Test Mono'});
    add(code);

    code.size();
    expect(DependencyContext.hasPromises()).toBe(true);
    await DependencyContext.consumePromises();
    expect(fonts.load).toHaveBeenCalledWith(
      expect.stringContaining('Code Test Mono'),
    );
  });
});
