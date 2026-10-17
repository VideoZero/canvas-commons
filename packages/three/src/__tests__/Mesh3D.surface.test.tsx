import {Layout, Rect, View2D, useScene2D} from '@canvas-commons/2d';
import {createRef} from '@canvas-commons/core';
import * as THREE from 'three';
import {describe, expect, test} from 'vitest';
import {Mesh3D} from '../Mesh3D';
import {Three} from '../ThreeNode';
import {configureThree} from '../loader';
import {FAKE_THREE, canvasCalls, fakeCanvasContexts} from './fakes';
import {mockScene} from './mockScene';

mockScene();
fakeCanvasContexts();
configureThree({module: FAKE_THREE});

/** The material that shows the surface content. */
function surfaceMaterial(mesh: Mesh3D): THREE.MeshStandardMaterial {
  const material = mesh.mesh().material;
  return (
    Array.isArray(material) ? material[6] : material
  ) as THREE.MeshStandardMaterial;
}

function surfaceTexture(mesh: Mesh3D): THREE.CanvasTexture {
  return surfaceMaterial(mesh).map as THREE.CanvasTexture;
}

describe('Mesh3D surface content', () => {
  test('2D children are drawn into a texture on the front face of a box', () => {
    const content = createRef<Rect>();
    const mesh = (
      <Mesh3D geometry="box" size={[200, 100, 20]}>
        <Rect ref={content} width={80} height={40} fill="#ff0000" />
      </Mesh3D>
    ) as Mesh3D;
    new Three({width: 400, height: 300, children: [mesh]});

    expect(mesh.hasSurface()).toBe(true);
    const material = mesh.mesh().material as THREE.Material[];
    expect(material).toHaveLength(7);
    const texture = surfaceTexture(mesh);
    expect(texture).toBeInstanceOf(THREE.CanvasTexture);
    const canvas = texture.image as HTMLCanvasElement;
    expect([canvas.width, canvas.height]).toEqual([200, 100]);
    expect(canvasCalls(canvas)).toContain('fill');
  });

  test('covers the whole surface of other shapes', () => {
    const mesh = new Mesh3D({
      geometry: 'sphere',
      children: [new Rect({width: 10, height: 10})],
    });
    expect(mesh.mesh().material).toBe(surfaceMaterial(mesh));
    expect(surfaceTexture(mesh)).toBeInstanceOf(THREE.CanvasTexture);
  });

  test('the content sees a view of its own, the size of the surface', () => {
    const content = createRef<Rect>();
    view().add(
      <Three width={400} height={300}>
        <Mesh3D size={[200, 100, 20]}>
          <Rect ref={content} />
        </Mesh3D>
      </Three>,
    );
    const surface = content().view();
    expect(surface).toBeInstanceOf(View2D);
    expect(surface).not.toBe(view());
    expect(surface.size()).toEqual({x: 200, y: 100});
  });

  test('a flex layout around the Three does not lay out the content', () => {
    const content = createRef<Rect>();
    const half = createRef<Rect>();
    view().add(
      <Layout layout gap={50} alignItems={'start'}>
        <Rect width={300} height={300} />
        <Three width={400} height={300}>
          <Mesh3D size={[200, 100, 20]}>
            <Rect ref={content} x={10} width={80} height={40} />
            <Rect ref={half} width={'50%'} height={'50%'} />
          </Mesh3D>
        </Three>
      </Layout>,
    );

    expect(content().isLayoutRoot()).toBe(true);
    expect(content().position()).toEqual({x: 10, y: 0});
    expect(content().size()).toEqual({x: 80, y: 40});
    // Percent sizes resolve against the surface, not the viewport.
    expect(half().size()).toEqual({x: 100, y: 50});
  });

  test('flex content lays out inside the surface', () => {
    const first = createRef<Rect>();
    const second = createRef<Rect>();
    view().add(
      <Layout layout>
        <Three width={400} height={300}>
          <Mesh3D size={[200, 100, 20]}>
            <Layout layout direction={'column'} width={200} height={100}>
              <Rect ref={first} width={200} height={30} />
              <Rect ref={second} width={200} height={30} />
            </Layout>
          </Mesh3D>
        </Three>
      </Layout>,
    );
    expect(first().position.y()).toBe(-35);
    expect(second().position.y()).toBe(-5);
  });

  test('a canvas that changes size gets a new texture', () => {
    const mesh = new Mesh3D({
      geometry: 'box',
      size: [200, 100, 20],
      children: [new Rect({width: 10, height: 10})],
    });
    new Three({width: 400, height: 300, children: [mesh]});
    const before = surfaceTexture(mesh);
    let disposed = false;
    before.addEventListener('dispose', () => (disposed = true));

    mesh.size([300, 100, 20]);
    const after = surfaceTexture(mesh);
    expect(after).not.toBe(before);
    expect(disposed).toBe(true);
    expect((after.image as HTMLCanvasElement).width).toBe(300);
  });

  test('rasterizes at the render scale of the Three, capped at 4096', () => {
    const mesh = new Mesh3D({
      size: [200, 100, 20],
      children: [new Rect({width: 10, height: 10})],
    });
    const stage = new Three({width: 400, height: 300, children: [mesh]});
    stage.renderScale(2);
    expect((surfaceTexture(mesh).image as HTMLCanvasElement).width).toBe(400);
    mesh.contentScale(0.5);
    expect((surfaceTexture(mesh).image as HTMLCanvasElement).width).toBe(100);
    mesh.contentScale(100);
    expect((surfaceTexture(mesh).image as HTMLCanvasElement).width).toBe(4096);
  });

  test('a fade of the mesh does not redraw the content', () => {
    const mesh = new Mesh3D({
      size: [200, 100, 20],
      children: [new Rect({width: 10, height: 10, fill: '#fff'})],
    });
    new Three({width: 400, height: 300, children: [mesh]});
    const canvas = surfaceTexture(mesh).image as HTMLCanvasElement;
    const fills = canvasCalls(canvas).length;
    mesh.opacity(0.5);
    expect(surfaceMaterial(mesh).opacity).toBeCloseTo(0.5);
    expect(canvasCalls(canvas)).toHaveLength(fills);
  });

  test('is uploaded premultiplied and un-premultiplied in the shader', () => {
    const mesh = new Mesh3D({children: [new Rect({width: 10, height: 10})]});
    const texture = surfaceTexture(mesh);
    expect(texture.premultiplyAlpha).toBe(true);
    expect(texture.colorSpace).toBe(THREE.NoColorSpace);

    const shader = {
      vertexShader: THREE.ShaderLib.standard.vertexShader,
      fragmentShader: THREE.ShaderLib.standard.fragmentShader,
      uniforms: {},
    };
    surfaceMaterial(mesh).onBeforeCompile(
      shader as unknown as THREE.WebGLProgramParametersWithUniforms,
      {} as THREE.WebGLRenderer,
    );
    expect(shader.fragmentShader).toContain(
      'sampledDiffuseColor.rgb /= max( sampledDiffuseColor.a, 1e-4 );',
    );
  });

  test('content is not tone mapped', () => {
    const mesh = new Mesh3D({children: [new Rect({width: 10, height: 10})]});
    expect(surfaceMaterial(mesh).toneMapped).toBe(false);
  });
});

function view(): View2D {
  return useScene2D().getView();
}
