import * as THREE from 'three';
import {afterAll, beforeAll} from 'vitest';

type Method = (...args: unknown[]) => unknown;

/**
 * A 2D context that records the names of the drawing calls made on it.
 * jsdom's canvas has no 2D context, so painting tests draw into this.
 */
export function recordingContext(canvas: HTMLCanvasElement): {
  calls: string[];
  context: CanvasRenderingContext2D;
} {
  const calls: string[] = [];
  let matrix = new DOMMatrix();
  const stack: DOMMatrix[] = [];
  const toMatrix = (args: unknown[]) =>
    typeof args[0] === 'object' && args[0] !== null
      ? DOMMatrix.fromMatrix(args[0] as DOMMatrixInit)
      : new DOMMatrix(args as number[]);
  const methods: Record<string, Method> = {
    save: () => stack.push(matrix),
    restore: () => {
      matrix = stack.pop() ?? new DOMMatrix();
    },
    getTransform: () => DOMMatrix.fromMatrix(matrix),
    setTransform: (...args) => {
      matrix = toMatrix(args);
    },
    resetTransform: () => {
      matrix = new DOMMatrix();
    },
    transform: (...args) => {
      matrix = matrix.multiply(toMatrix(args));
    },
    translate: (x, y) => {
      matrix = matrix.translate(Number(x), Number(y));
    },
    scale: (x, y) => {
      matrix = matrix.scale(Number(x), Number(y));
    },
    rotate: angle => {
      matrix = matrix.rotate((Number(angle) * 180) / Math.PI);
    },
    getLineDash: () => [],
    measureText: () => ({width: 0}),
  };
  const state: Record<string, unknown> = {
    canvas,
    globalAlpha: 1,
    globalCompositeOperation: 'source-over',
    filter: 'none',
    lineWidth: 1,
    fillStyle: '#000000',
    strokeStyle: '#000000',
  };
  const context = new Proxy(state, {
    get(target, key) {
      if (typeof key !== 'string') {
        return undefined;
      }
      if (key in target) {
        return target[key];
      }
      const method = methods[key];
      return (...args: unknown[]) => {
        calls.push(key);
        return method?.(...args);
      };
    },
    set(target, key, value) {
      if (typeof key === 'string') {
        target[key] = value;
      }
      return true;
    },
  });
  return {calls, context: context as unknown as CanvasRenderingContext2D};
}

/**
 * Give every canvas a {@link recordingContext} for the tests of the current
 * file. The calls of each canvas are kept on {@link canvasCalls}.
 */
export function fakeCanvasContexts() {
  let original: typeof HTMLCanvasElement.prototype.getContext;
  beforeAll(() => {
    globalThis.Path2D ??= FakePath2D as unknown as typeof Path2D;
    original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (
      this: HTMLCanvasElement,
      kind: string,
    ) {
      if (kind !== '2d') {
        return null;
      }
      let entry = CONTEXTS.get(this);
      if (!entry) {
        entry = recordingContext(this);
        CONTEXTS.set(this, entry);
      }
      return entry.context;
    } as typeof HTMLCanvasElement.prototype.getContext;
  });
  afterAll(() => {
    HTMLCanvasElement.prototype.getContext = original;
  });
}

/** jsdom has no `Path2D`; shapes only need to build one. */
class FakePath2D {
  public addPath() {}
  public arc() {}
  public arcTo() {}
  public bezierCurveTo() {}
  public closePath() {}
  public ellipse() {}
  public lineTo() {}
  public moveTo() {}
  public quadraticCurveTo() {}
  public rect() {}
  public roundRect() {}
}

const CONTEXTS = new WeakMap<
  HTMLCanvasElement,
  ReturnType<typeof recordingContext>
>();

/** The drawing calls made on `canvas` through a faked context. */
export function canvasCalls(canvas: HTMLCanvasElement): string[] {
  return CONTEXTS.get(canvas)?.calls ?? [];
}

/**
 * Stands in for `THREE.WebGLRenderer`, which needs a WebGL context jsdom
 * does not have. Losing the context is simulated by {@link loseContext}.
 */
export class FakeWebGLRenderer {
  public static readonly instances: FakeWebGLRenderer[] = [];

  public readonly domElement: HTMLCanvasElement;
  public readonly antialias: boolean;
  public readonly shadowMap = {enabled: false, type: THREE.PCFShadowMap};
  public readonly capabilities = {getMaxAnisotropy: () => 1};
  public toneMapping: THREE.ToneMapping = THREE.NoToneMapping;
  public toneMappingExposure = 1;
  public autoClear = true;
  public disposed = false;
  public readonly rendered: THREE.Scene[] = [];

  public constructor(options: {canvas: HTMLCanvasElement; antialias: boolean}) {
    this.domElement = options.canvas;
    this.antialias = options.antialias;
    FakeWebGLRenderer.instances.push(this);
  }

  public setPixelRatio() {}
  public setSize(width: number, height: number) {
    this.domElement.width = width;
    this.domElement.height = height;
  }
  public setViewport() {}
  public readonly clearColors: {color: THREE.Color; alpha: number}[] = [];
  public setClearColor(color: THREE.Color | number, alpha = 1) {
    this.clearColors.push({color: new THREE.Color(color), alpha});
  }
  public clear() {}
  public getRenderTarget() {
    return null;
  }
  public setRenderTarget() {}
  public render(scene: THREE.Scene) {
    this.rendered.push(scene);
  }
  public dispose() {
    this.disposed = true;
  }
  public forceContextLoss() {
    this.loseContext();
  }
  public loseContext() {
    this.domElement.dispatchEvent(
      new Event('webglcontextlost', {cancelable: true}),
    );
  }
}

/**
 * Stands in for `THREE.TextureLoader`, as jsdom loads no images: a URL that
 * starts with `fail:` fails, any other loads.
 */
export class FakeTextureLoader {
  public setCrossOrigin() {}
  public load(
    url: string,
    onLoad: (texture: THREE.Texture) => void,
    _onProgress: unknown,
    onError: (error: unknown) => void,
  ): THREE.Texture {
    const texture = new THREE.Texture();
    setTimeout(() => {
      if (url.startsWith('fail:')) {
        onError(new Error('not found'));
      } else {
        onLoad(texture);
      }
    });
    return texture;
  }
}

/** The Three.js runtime with the fakes above in place of the real parts. */
export const FAKE_THREE = {
  ...THREE,
  /* eslint-disable @typescript-eslint/naming-convention */
  WebGLRenderer: FakeWebGLRenderer,
  TextureLoader: FakeTextureLoader,
  /* eslint-enable @typescript-eslint/naming-convention */
} as unknown as typeof THREE;
