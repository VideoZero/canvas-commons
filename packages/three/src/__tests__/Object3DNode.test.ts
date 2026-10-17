import * as THREE from 'three';
import {describe, expect, test} from 'vitest';
import {Group3D} from '../Group3D';
import {Mesh3D} from '../Mesh3D';
import {Three} from '../ThreeNode';
import {configureThree, isThreeLoaded} from '../loader';
import {captureLogs, mockScene} from './mockScene';

const SCENE = mockScene();

// These run before the runtime is registered further down: nothing in this
// file has started a load, which is the generator-code situation the nodes
// warn about.
describe('reads before the runtime has loaded', () => {
  test('screenPosition() returns zero and warns once per node', () => {
    expect(isThreeLoaded()).toBe(false);
    const logs = captureLogs(SCENE);
    const mesh = new Mesh3D();
    new Three({width: 400, height: 300, children: [mesh]});

    const first = mesh.screenPosition();
    expect(first.x).toBe(0);
    expect(first.y).toBe(0);
    mesh.screenPosition();

    expect(logs.warnings).toHaveLength(1);
    expect(logs.warnings[0].message).toContain('screenPosition()');
    expect(logs.warnings[0].message).toContain('before Three.js loaded');
  });

  test('projectPoint() returns zero and warns once per node', () => {
    const logs = captureLogs(SCENE);
    const stage = new Three({width: 400, height: 300});
    const point = stage.projectPoint([100, 50, 0]);
    expect(point.x).toBe(0);
    expect(point.y).toBe(0);
    stage.projectPoint([0, 0, 0]);
    stage.projectObject(new THREE.Object3D());
    expect(logs.warnings).toHaveLength(1);
    expect(logs.warnings[0].message).toContain('projectPoint()');
  });

  test('a 3D node outside any Three returns zero without warning', () => {
    const logs = captureLogs(SCENE);
    const mesh = new Mesh3D();
    expect(mesh.screenPosition().x).toBe(0);
    expect(logs.warnings).toHaveLength(0);
  });
});

describe('with the runtime loaded', () => {
  test('registering the runtime flips the loaded state', () => {
    configureThree({module: THREE});
    expect(isThreeLoaded()).toBe(true);
  });

  test('the target plane maps 1:1 to pixels of the Three node', () => {
    const mesh = new Mesh3D({x: 100, y: -50});
    new Three({width: 400, height: 300, children: [mesh]});
    const position = mesh.screenPosition();
    expect(position.x).toBeCloseTo(100, 3);
    expect(position.y).toBeCloseTo(-50, 3);
  });

  test('transform signals follow the 2D conventions', () => {
    const mesh = new Mesh3D({
      x: 10,
      y: 20,
      z: 30,
      rotation: 90,
      rotationX: 45,
      rotationY: 30,
      scale: 2,
    });
    const object = mesh.object3D();
    // y grows down on screen, up in Three.js.
    expect(object.position.toArray()).toEqual([10, -20, 30]);
    // `rotation` is clockwise on screen, which is a negative turn about z.
    expect(object.rotation.z).toBeCloseTo(-Math.PI / 2);
    expect(object.rotation.x).toBeCloseTo(-Math.PI / 4);
    expect(object.rotation.y).toBeCloseTo(Math.PI / 6);
    // scaleZ follows the x scale by default.
    expect(object.scale.toArray()).toEqual([2, 2, 2]);
    mesh.scaleZ(5);
    expect(mesh.object3D().scale.z).toBe(5);
  });

  test('opacity accumulates through 3D ancestors and hides at zero', () => {
    const child = new Mesh3D({opacity: 0.5});
    new Group3D({opacity: 0.5, children: [child]});
    expect(child.opacity3D()).toBeCloseTo(0.25);
    expect(child.object3D().visible).toBe(true);
    child.opacity(0);
    expect(child.object3D().visible).toBe(false);
  });

  test('3D children mirror the node tree', () => {
    const inner = new Mesh3D();
    const group = new Group3D({children: [inner]});
    const stage = new Three({width: 400, height: 300, children: [group]});
    stage.sceneObject();
    expect(stage.rootGroup().children).toContain(group.object3D());
    expect(group.object3D().children).toContain(inner.object3D());

    inner.remove();
    stage.sceneObject();
    expect(group.object3D().children).not.toContain(inner.object3D());
  });
});
