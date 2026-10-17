import {
  PlaybackStatus,
  UNIFORM_FRAME,
  createSignal,
} from '@canvas-commons/core';
import {afterEach, describe, expect, test, vi} from 'vitest';
import {Node, Rect} from '..';
import {useScene2D} from '../../scenes';
import {mockScene2D} from './mockScene2D';

function mockShaders() {
  const shaders = useScene2D().shaders;
  const locations = new Map<string, WebGLUniformLocation>();
  const gl = {
    canvas: document.createElement('canvas'),
    getUniformLocation(_: WebGLProgram, name: string) {
      const location = locations.get(name) ?? {};
      locations.set(name, location);
      return location;
    },
    uniform1f: vi.fn(),
    uniform1i: vi.fn(),
    uniformMatrix4fv: vi.fn(),
  };
  vi.spyOn(shaders, 'getGL').mockReturnValue(
    gl as unknown as WebGL2RenderingContext,
  );
  vi.spyOn(shaders, 'getProgram').mockReturnValue({} as WebGLProgram);
  vi.spyOn(shaders, 'copyTextures').mockReturnValue(undefined);
  vi.spyOn(shaders, 'clear').mockReturnValue(undefined);
  vi.spyOn(shaders, 'render').mockReturnValue(undefined);
  return {gl, location: (name: string) => locations.get(name)};
}

describe('shaders', () => {
  mockScene2D({experimentalFeatures: true});

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test('accept a signal on a node', () => {
    const fragment = createSignal('void main() {}');
    const node = <Node shaders={() => fragment()} />;

    expect(node.shaders()).toEqual([{fragment: 'void main() {}'}]);
    fragment('void main() { /* changed */ }');
    expect(node.shaders()).toEqual([
      {fragment: 'void main() { /* changed */ }'},
    ]);
  });

  test('accept a signal for fill and stroke shaders', () => {
    const fragment = createSignal<string | null>(null);
    const rect = (
      <Rect fillShaders={() => fragment()} strokeShaders={fragment} />
    ) as Rect;

    expect(rect.fillShaders()).toEqual([]);
    fragment('void main() {}');
    expect(rect.fillShaders()).toEqual([{fragment: 'void main() {}'}]);
    expect(rect.strokeShaders()).toEqual([{fragment: 'void main() {}'}]);
  });

  test('pass the frame number as the frame uniform', () => {
    const {gl, location} = mockShaders();
    vi.spyOn(PlaybackStatus.prototype, 'frame', 'get').mockReturnValue(42);
    const node = <Node shaders={'void main() {}'} />;
    useScene2D().getView().add(node);
    const image = document.createElement('canvas');

    node['shaderCanvas'](image, image);

    expect(gl.uniform1i).toHaveBeenCalledWith(location(UNIFORM_FRAME), 42);
  });
});
