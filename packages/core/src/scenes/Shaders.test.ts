import {describe, expect, test} from 'vitest';
import type {SharedWebGLContext} from '../app/SharedWebGLContext';
import {EventDispatcher} from '../events';
import type {Scene} from './Scene';
import {Shaders} from './Shaders';

const TEXTURE_MIN_FILTER = 0x2801;
const TEXTURE_MAG_FILTER = 0x2800;
const LINEAR = 0x2601;

function createRecordingContext() {
  const filters: Map<unknown, Map<number, number>> = new Map();
  let bound: unknown = null;
  const constants = new Map([
    ['TEXTURE_MIN_FILTER', TEXTURE_MIN_FILTER],
    ['TEXTURE_MAG_FILTER', TEXTURE_MAG_FILTER],
    ['LINEAR', LINEAR],
  ]);
  const methods: Record<string, (...args: unknown[]) => unknown> = {
    createTexture: () => ({}),
    bindTexture: (_target, texture) => {
      bound = texture;
    },
    texParameteri: (_target, name, value) => {
      if (!filters.has(bound)) {
        filters.set(bound, new Map());
      }
      filters.get(bound)?.set(name as number, value as number);
    },
  };
  const gl = new Proxy(
    {canvas: {width: 0, height: 0}},
    {
      get: (target, property) => {
        if (typeof property !== 'string') return undefined;
        if (property === 'canvas') return target.canvas;
        if (property in methods) return methods[property];
        if (constants.has(property)) return constants.get(property);
        if (/^[A-Z0-9_]+$/.test(property)) return 0;
        return () => null;
      },
    },
  );
  return {gl: gl as unknown as WebGL2RenderingContext, filters};
}

describe('Shaders', () => {
  test('sample the source and destination textures linearly', () => {
    const scene = {
      onReloaded: new EventDispatcher<void>().subscribable,
      getRealSize: () => ({width: 1, height: 1}),
    };
    const shaders = new Shaders(
      scene as unknown as Scene,
      {} as SharedWebGLContext,
    );
    const {gl, filters} = createRecordingContext();

    shaders.setup(gl);

    expect(filters.size).toBe(2);
    for (const texture of filters.values()) {
      expect(texture.get(TEXTURE_MIN_FILTER)).toBe(LINEAR);
      expect(texture.get(TEXTURE_MAG_FILTER)).toBe(LINEAR);
    }
  });
});
