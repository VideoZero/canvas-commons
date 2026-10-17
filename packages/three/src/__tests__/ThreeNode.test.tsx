import {Rect, useScene2D} from '@canvas-commons/2d';
import {createComputed} from '@canvas-commons/core';
import * as THREE from 'three';
import {describe, expect, test, vi} from 'vitest';
import {Group3D} from '../Group3D';
import {Light3D} from '../Light3D';
import {Mesh3D} from '../Mesh3D';
import {Object3D} from '../Object3D';
import {Three} from '../ThreeNode';
import {ThreeModule, configureThree, isThreeLoaded} from '../loader';
import {getSharedRenderer} from '../renderer';
import {
  FAKE_THREE,
  FakeWebGLRenderer,
  fakeCanvasContexts,
  recordingContext,
} from './fakes';
import {captureLogs, mockScene} from './mockScene';

const SCENE = mockScene();
fakeCanvasContexts();

function renderer(): FakeWebGLRenderer {
  return getSharedRenderer(FAKE_THREE) as unknown as FakeWebGLRenderer;
}

function draw(node: Three): string[] {
  const {calls, context} = recordingContext(document.createElement('canvas'));
  node.render(context);
  return calls;
}

// Runs first: nothing in this file has loaded the runtime yet.
describe('before the runtime has loaded', () => {
  test('escape hatches throw, then work once `yield stage()` returns', async () => {
    let resolve: (runtime: ThreeModule) => void = () => {};
    const runtime = new Promise<ThreeModule>(done => (resolve = done));
    configureThree({load: () => runtime});
    const mesh = new Mesh3D();
    const stage = new Three({width: 400, height: 300, children: [mesh]});

    expect(() => stage.sceneObject()).toThrow(/has not loaded yet/);
    expect(() => stage.cameraObject()).toThrow(/has not loaded yet/);
    expect(() => stage.rootGroup()).toThrow(/has not loaded yet/);
    expect(() => mesh.object3D()).toThrow(/has not loaded yet/);

    // A computed that asked too early must not stay cached at its failure.
    const attached = createComputed(() => {
      try {
        return stage.rootGroup().children.includes(mesh.object3D());
      } catch {
        return null;
      }
    });
    expect(attached()).toBeNull();

    const ready = stage.toPromise();
    resolve(FAKE_THREE);
    await ready;
    expect(isThreeLoaded()).toBe(true);
    expect(attached()).toBe(true);
  });
});

describe('Three', () => {
  test('3D nodes are valid JSX children', () => {
    const stage = (
      <Three width={400} height={300}>
        <Group3D>
          <Mesh3D geometry="sphere" />
          <Light3D kind="point" />
          <Object3D create={three => new three.Group()} />
        </Group3D>
      </Three>
    ) as Three;
    expect(stage.children()).toHaveLength(1);
  });

  test('a clone keeps the callbacks', () => {
    const onUpdate = vi.fn();
    const onRender = vi.fn();
    const stage = new Three({width: 400, height: 300, onUpdate, onRender});
    const copy = stage.clone();
    expect(copy.onUpdate).toBe(onUpdate);
    expect(copy.onRender).toBe(onRender);

    const create = () => new THREE.Group();
    const update = vi.fn();
    const object = new Object3D({create, update}).clone();
    expect(object.create).toBe(create);
    expect(object.update).toBe(update);
  });

  test('draws the 3D image between the fill and the stroke', () => {
    const stage = new Three({
      width: 200,
      height: 100,
      fill: '#123456',
      stroke: '#ffffff',
      lineWidth: 8,
      background: '#000000',
    });
    useScene2D().getView().add(stage);
    const paint = (calls: string[]) =>
      calls.filter(call => ['fill', 'stroke', 'drawImage'].includes(call));

    expect(paint(draw(stage))).toEqual(['fill', 'drawImage', 'stroke']);
    stage.strokeFirst(true);
    expect(paint(draw(stage))).toEqual(['stroke', 'fill', 'drawImage']);
  });

  test('a translucent background keeps its colour and alpha', () => {
    const stage = new Three({
      width: 200,
      height: 100,
      background: 'rgba(255, 0, 0, 0.5)',
    });
    useScene2D().getView().add(stage);
    draw(stage);
    const clear = renderer().clearColors.at(-1);
    expect(clear?.alpha).toBeCloseTo(0.5);
    expect(clear?.color.getHexString()).toBe('ff0000');
  });

  test('a throwing `onRender` is logged once and the frame survives', () => {
    const logs = captureLogs(SCENE);
    const stage = new Three({
      width: 200,
      height: 100,
      onRender: () => {
        throw new Error('composer broke');
      },
    });
    useScene2D().getView().add(stage);
    expect(() => draw(stage)).not.toThrow();
    draw(stage);
    expect(logs.errors).toHaveLength(1);
    expect(logs.errors[0].message).toContain('onRender threw: composer broke');
  });

  test('toggling shadows recompiles the materials', () => {
    const mesh = new Mesh3D();
    const stage = new Three({width: 200, height: 100, children: [mesh]});
    useScene2D().getView().add(stage);
    draw(stage);
    const material = mesh.mesh().material as THREE.Material;
    const version = material.version;
    draw(stage);
    expect(material.version).toBe(version);
    stage.shadows(true);
    draw(stage);
    expect(material.version).toBeGreaterThan(version);
  });

  test('nodes sharing a raw scene keep their 3D children apart', () => {
    const raw = new THREE.Scene();
    const lit = new Three({
      scene: raw,
      width: 200,
      height: 100,
      children: [new Light3D(), new Mesh3D()],
    });
    let litVisible: boolean | null = null;
    const other = new Three({
      scene: raw,
      width: 200,
      height: 100,
      children: [new Mesh3D()],
      onRender: () => {
        litVisible = lit.rootGroup().visible;
      },
    });
    useScene2D().getView().add([lit, other]);
    lit.sceneObject();

    // The lights of one node do not light the other.
    expect(other.rootGroup().getObjectByName('default-lights')).toBeDefined();
    expect(lit.rootGroup().getObjectByName('default-lights')).toBeUndefined();

    draw(other);
    expect(litVisible).toBe(false);
    expect(lit.rootGroup().visible).toBe(true);
  });

  test('fog leaves a raw scene that was swapped out or disposed', () => {
    const first = new THREE.Scene();
    const second = new THREE.Scene();
    const stage = new Three({width: 200, height: 100, scene: first});
    stage.fog('#ffffff');
    stage.sceneObject();
    expect(first.fog).not.toBeNull();

    stage.scene(second);
    stage.sceneObject();
    expect(first.fog).toBeNull();
    expect(second.fog).not.toBeNull();

    stage.dispose();
    expect(second.fog).toBeNull();
  });

  test('fog alpha stretches the fade', () => {
    const stage = new Three({width: 200, height: 100, fog: '#ffffff'});
    const span = () => {
      const fog = stage.sceneObject().fog as THREE.Fog;
      return fog.far - fog.near;
    };
    const opaque = span();
    stage.fog('rgba(255, 255, 255, 0.5)');
    expect(span()).toBeCloseTo(opaque * 2);
    stage.fog('rgba(255, 255, 255, 0)');
    expect(stage.sceneObject().fog).toBeNull();
  });

  test('disposing releases the default light rig', () => {
    const stage = new Three({width: 200, height: 100});
    const rig = stage.rootGroup().getObjectByName('default-lights');
    const disposed = vi.fn();
    rig?.traverse(object => {
      if ((object as THREE.Light).isLight) {
        object.addEventListener('dispose', disposed);
      }
    });
    expect(rig?.children).toHaveLength(3);
    stage.dispose();
    expect(disposed).toHaveBeenCalledTimes(3);
  });
});

describe('Light3D', () => {
  function lightOf(node: Light3D): THREE.Light {
    return node.object3D().children[0] as THREE.Light;
  }

  test('colour alpha multiplies the intensity', () => {
    const node = new Light3D({
      kind: 'point',
      color: 'rgba(255, 0, 0, 0.5)',
      intensity: 2,
    });
    const light = lightOf(node);
    expect(light.color.getHexString()).toBe('ff0000');
    expect(light.intensity).toBeCloseTo(1);
  });

  test('ground colour alpha dims the hemisphere ground light', () => {
    const node = new Light3D({
      kind: 'hemisphere',
      groundColor: 'rgba(255, 255, 255, 0.5)',
    });
    const light = lightOf(node) as THREE.HemisphereLight;
    expect(light.groundColor.r).toBeCloseTo(0.5);
  });

  test('the target is given in the space of the parent', () => {
    const light = new Light3D({
      kind: 'directional',
      x: 50,
      target: [100, 0, 0],
    });
    const group = new Group3D({x: 100, children: [light]});
    const directional = lightOf(light) as THREE.DirectionalLight;
    expect(directional.target.parent).toBe(light.object3D());
    group.object3D().updateMatrixWorld(true);
    const target = directional.target.getWorldPosition(new THREE.Vector3());
    expect(target.x).toBeCloseTo(200);
  });
});

describe('3D nodes', () => {
  test('a mesh does not scale its 3D children by its size', () => {
    const child = new Mesh3D({x: 120});
    const parent = new Mesh3D({size: [300, 100, 50], children: [child]});
    expect(parent.mesh().scale.toArray()).toEqual([300, 100, 50]);
    expect(parent.object3D().scale.toArray()).toEqual([1, 1, 1]);
    expect(child.object3D().parent).toBe(parent.object3D());
  });

  test('pass no opacity down to 2D content', () => {
    const content = new Rect({width: 10, height: 10});
    const mesh = new Mesh3D({opacity: 0.25, children: [content]});
    new Three({width: 200, height: 100, opacity: 0.5, children: [mesh]});
    expect(mesh.absoluteOpacity()).toBe(1);
    expect(content.absoluteOpacity()).toBe(1);
    expect(mesh.opacity3D()).toBeCloseTo(0.25);
  });

  test('2D children of a node without a surface warn once', () => {
    const logs = captureLogs(SCENE);
    const group = new Group3D({children: [new Rect({})]});
    group.object3D();
    group.x(10);
    group.object3D();
    new Mesh3D({children: [new Rect({})]}).object3D();
    expect(logs.warnings).toHaveLength(1);
    expect(logs.warnings[0].message).toContain('2D children are not rendered');
  });

  test('a 3D node outside a Three warns once when rendered', () => {
    const logs = captureLogs(SCENE);
    const mesh = new Mesh3D();
    useScene2D().getView().add(mesh);
    const {context} = recordingContext(document.createElement('canvas'));
    mesh.render(context);
    mesh.render(context);
    expect(logs.warnings).toHaveLength(1);
    expect(logs.warnings[0].message).toContain('not inside a Three node');
  });

  test('a texture that fails to load is reported once', async () => {
    const logs = captureLogs(SCENE);
    const first = new Mesh3D({map: 'fail:missing.png'});
    const second = new Mesh3D({map: 'fail:missing.png'});
    first.mesh();
    second.mesh();
    await first.toPromise();
    await second.toPromise();
    const material = first.mesh().material as THREE.MeshStandardMaterial;
    expect(material.map).toBeNull();
    expect(logs.errors).toHaveLength(1);
    expect(logs.errors[0].message).toContain('failed to load texture');
  });
});
