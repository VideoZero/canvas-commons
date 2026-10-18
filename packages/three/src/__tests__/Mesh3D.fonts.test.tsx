import {Node, Txt, View2D, useScene2D} from '@canvas-commons/2d';
import {DependencyContext} from '@canvas-commons/core';
import type * as THREE from 'three';
import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest';
import {Mesh3D} from '../Mesh3D';
import {Three} from '../ThreeNode';
import {configureThree} from '../loader';
import {FAKE_THREE, fakeCanvasContexts} from './fakes';
import {mockScene} from './mockScene';

mockScene();
fakeCanvasContexts();
configureThree({module: FAKE_THREE});

function view(): View2D {
  return useScene2D().getView();
}

function surfaceTexture(mesh: Mesh3D): THREE.Texture | null {
  const material = mesh.mesh().material;
  const surface = (Array.isArray(material) ? material[6] : material) as
    THREE.MeshStandardMaterial | undefined;
  return surface?.map ?? null;
}

function context(): CanvasRenderingContext2D {
  const context = document.createElement('canvas').getContext('2d');
  if (!context) throw new Error('No 2D context');
  return context;
}

describe('Mesh3D surface fonts', () => {
  const loaded = new Set<string>();
  const faces = ['Surface Face', 'Nested Face'].map(family => ({
    family,
    style: 'normal',
    weight: '1 1000',
  }));
  const fonts = {
    size: faces.length,
    [Symbol.iterator]: () => faces[Symbol.iterator](),
    check: vi.fn((font: string) => loaded.has(font)),
    load: vi.fn(async (font: string) => {
      loaded.add(font);
      return [];
    }),
    addEventListener: vi.fn(),
  };

  beforeEach(() => {
    Object.defineProperty(document, 'fonts', {
      value: fonts,
      configurable: true,
    });
  });
  afterEach(async () => {
    await DependencyContext.consumePromises();
    Reflect.deleteProperty(document, 'fonts');
    vi.clearAllMocks();
  });

  function requested(family: string) {
    return fonts.load.mock.calls.filter(([font]) => font.endsWith(family));
  }

  test('the scene waits for a web font of the content and redraws it', async () => {
    const mesh = (
      <Mesh3D geometry="box" size={[200, 100, 20]}>
        <Txt text="Label" fontFamily="Surface Face" />
      </Mesh3D>
    ) as Mesh3D;
    const stage = new Three({width: 400, height: 300, children: [mesh]});
    view().add(stage);

    stage.render(context());
    expect(DependencyContext.hasPromises()).toBe(true);
    const version = surfaceTexture(mesh)?.version ?? 0;

    await DependencyContext.consumePromises();
    expect(requested('Surface Face')).toHaveLength(1);
    stage.render(context());

    expect(surfaceTexture(mesh)?.version).toBeGreaterThan(version);
  });

  test('yielding the stage waits for fonts of nested content', async () => {
    const mesh = (
      <Mesh3D geometry="box" size={[200, 100, 20]}>
        <Node>
          <Txt text="Label" fontFamily="Nested Face" />
        </Node>
      </Mesh3D>
    ) as Mesh3D;
    const stage = new Three({width: 400, height: 300, children: [mesh]});
    view().add(stage);

    await stage.toPromise();

    expect(requested('Nested Face')).toHaveLength(1);
  });
});
