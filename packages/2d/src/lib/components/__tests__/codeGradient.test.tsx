import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';
import {Code} from '../Code';
import {failOnSceneErrors} from './failOnSceneErrors';
import {mockScene2D} from './mockScene2D';
import {mockTextContext} from './mockTextContext';
import {add} from './sceneFixtures';

function fakeContext(): CanvasRenderingContext2D {
  const gradient = {addColorStop: () => undefined};
  return new Proxy(
    {canvas: document.createElement('canvas')},
    {
      get: (target: Record<string, unknown>, property: string) => {
        if (property in target) return target[property];
        if (property.startsWith('create')) return () => gradient;
        if (property === 'measureText') return () => ({width: 0});
        return () => undefined;
      },
      set: (target: Record<string, unknown>, property: string, value) => {
        target[property] = value;
        return true;
      },
    },
  ) as unknown as CanvasRenderingContext2D;
}

describe('Code painted with a CSS gradient', () => {
  mockScene2D();
  failOnSceneErrors();
  mockTextContext();

  beforeAll(() => {
    const getContext = HTMLCanvasElement.prototype.getContext;
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(
      function (this: HTMLCanvasElement, ...args: [string]) {
        const context = getContext.apply(this, args);
        if (context) {
          Object.assign(context, {
            createLinearGradient: () => ({addColorStop: () => undefined}),
          });
        }
        return context;
      },
    );
  });

  afterAll(() => {
    vi.restoreAllMocks();
  });

  it('is measured and drawn', () => {
    const code = new Code({code: 'abc', fill: 'linear-gradient(red, blue)'});
    add(code);

    expect(code.size().x).toBeGreaterThan(0);
    expect(() => code.render(fakeContext())).not.toThrow();
  });
});
