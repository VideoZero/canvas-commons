import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest';
import {Logger} from './Logger';
import {SharedWebGLContext} from './SharedWebGLContext';

function createFailingContext(): WebGL2RenderingContext {
  return new Proxy(
    {},
    {
      get: (_target, property) => {
        if (property === 'getShaderParameter') return () => false;
        if (property === 'getShaderInfoLog') return () => null;
        if (property === 'createShader') return () => ({});
        if (typeof property === 'string' && /^[A-Z_]+$/.test(property)) {
          return 0;
        }
        return () => undefined;
      },
    },
  ) as WebGL2RenderingContext;
}

describe('SharedWebGLContext', () => {
  beforeEach(() => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
      createFailingContext(),
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  test('reports shader errors on a page with a null origin', () => {
    vi.stubGlobal('origin', 'null');
    vi.stubGlobal('location', {origin: 'null'});
    const logger = new Logger();
    const error = vi.spyOn(logger, 'error');
    const context = new SharedWebGLContext(logger);

    expect(
      context.getProgram('//# sourceURL=/shaders/effect.glsl', 'vertex'),
    ).toBeNull();
    expect(error).toHaveBeenCalled();
  });
});
