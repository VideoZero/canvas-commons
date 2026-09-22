import * as THREE from 'three';
import {describe, expect, test} from 'vitest';
import {Mesh3D} from './Mesh3D';
import {Object3D} from './Object3D';
import {Three} from './ThreeNode';
import {configureThree} from './loader';
import {captureLogs, mockScene2D} from './testScene';

const scene = mockScene2D();
configureThree({module: THREE});

function box(three: typeof THREE, color = '#22c55e'): THREE.Mesh {
  return new three.Mesh(
    new three.BoxGeometry(100, 100, 100),
    new three.MeshStandardMaterial({color}),
  );
}

describe('Object3D callbacks', () => {
  test('a throwing `update` is logged and leaves the siblings intact', () => {
    const logs = captureLogs(scene);
    const broken = new Object3D({
      create: three => box(three),
      update: () => {
        throw new Error('boom');
      },
    });
    const sibling = new Mesh3D({geometry: 'sphere'});
    const stage = new Three({
      width: 400,
      height: 300,
      children: [broken, sibling],
    });

    expect(() => stage.sceneObject()).not.toThrow();
    const root = stage.rootGroup();
    expect(root.children).toContain(sibling.object3D());
    expect(root.children).toContain(broken.object3D());
    // The object itself is still attached; only the callback's edits are
    // missing.
    expect(broken.raw()).toBeInstanceOf(THREE.Mesh);
    expect(broken.object3D().children).toContain(broken.raw());

    expect(logs.errors).toHaveLength(1);
    expect(logs.errors[0].message).toContain('Object3D update threw: boom');
  });

  test('a throwing `create` is logged once and leaves the node empty', () => {
    const logs = captureLogs(scene);
    const broken = new Object3D({
      create: () => {
        throw new Error('no object');
      },
    });
    const sibling = new Mesh3D({geometry: 'box'});
    const stage = new Three({
      width: 400,
      height: 300,
      children: [broken, sibling],
    });

    stage.sceneObject();
    expect(broken.raw()).toBeNull();
    expect(broken.object3D().children).toHaveLength(0);
    expect(stage.rootGroup().children).toContain(sibling.object3D());

    // A later sync does not run the factory again.
    broken.x(10);
    stage.sceneObject();
    expect(logs.errors).toHaveLength(1);
    expect(logs.errors[0].message).toContain('Object3D create threw');
  });

  test('a throwing `onUpdate` still yields a scene', () => {
    const logs = captureLogs(scene);
    const mesh = new Mesh3D();
    const stage = new Three({
      width: 400,
      height: 300,
      children: [mesh],
      onUpdate: () => {
        throw new Error('bad update');
      },
    });
    expect(stage.sceneObject()).toBeInstanceOf(THREE.Scene);
    expect(stage.rootGroup().children).toContain(mesh.object3D());
    expect(logs.errors).toHaveLength(1);
    expect(logs.errors[0].message).toContain('onUpdate threw: bad update');
  });
});

describe('Object3D opacity', () => {
  test('multiplies the material opacity the user set in `update`', () => {
    const node = new Object3D({
      create: three => box(three),
      update: object => {
        const material = (object as THREE.Mesh)
          .material as THREE.MeshStandardMaterial;
        material.opacity = 0.8;
        material.transparent = true;
      },
      opacity: 0.5,
    });
    new Three({width: 400, height: 300, children: [node]}).sceneObject();
    const material = (node.raw() as THREE.Mesh)
      .material as THREE.MeshStandardMaterial;
    expect(material.opacity).toBeCloseTo(0.4);
    expect(material.transparent).toBe(true);
  });

  test('restores a supplied object when the opacity returns to 1', () => {
    const shared = box(THREE);
    const material = shared.material as THREE.MeshStandardMaterial;
    const node = new Object3D({object: shared, opacity: 0.25});
    const stage = new Three({width: 400, height: 300, children: [node]});
    stage.sceneObject();
    expect(material.opacity).toBeCloseTo(0.25);
    expect(material.transparent).toBe(true);

    node.opacity(1);
    stage.sceneObject();
    expect(material.opacity).toBe(1);
    expect(material.transparent).toBe(false);
  });
});
