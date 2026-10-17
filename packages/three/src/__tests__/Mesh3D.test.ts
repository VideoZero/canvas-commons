import * as THREE from 'three';
import {describe, expect, test} from 'vitest';
import {Mesh3D, normalizeMesh3DSize} from '../Mesh3D';
import {configureThree} from '../loader';
import {mockScene} from './mockScene';

mockScene();
configureThree({module: THREE});

function bounds(geometry: THREE.BufferGeometry): THREE.Box3 {
  geometry.computeBoundingBox();
  return geometry.boundingBox ?? new THREE.Box3();
}

function extents(geometry: THREE.BufferGeometry): THREE.Vector3 {
  return bounds(geometry).getSize(new THREE.Vector3());
}

describe('normalizeMesh3DSize', () => {
  test('repeats the width for missing dimensions', () => {
    expect(normalizeMesh3DSize(200)).toEqual([200, 200, 200]);
    expect(normalizeMesh3DSize([300, 100])).toEqual([300, 100, 300]);
    expect(normalizeMesh3DSize([300, 100, 50])).toEqual([300, 100, 50]);
  });
});

describe('Mesh3D geometry', () => {
  test('primitives stay unit sized and carry `size` as the mesh scale', () => {
    const node = new Mesh3D({geometry: 'box', size: [300, 100, 50]});
    const mesh = node.mesh();
    expect(mesh.scale.toArray()).toEqual([300, 100, 50]);
    const size = extents(mesh.geometry);
    expect(size.x).toBeCloseTo(1);
    expect(size.y).toBeCloseTo(1);
    expect(size.z).toBeCloseTo(1);
  });

  test('a size change does not rebuild a plain primitive', () => {
    const node = new Mesh3D({geometry: 'sphere', size: 200});
    const before = node.mesh().geometry;
    node.size(400);
    expect(node.mesh().geometry).toBe(before);
    expect(node.mesh().scale.toArray()).toEqual([400, 400, 400]);
  });

  test('origin "bottom" puts the pivot on the base so the shape grows upward', () => {
    const node = new Mesh3D({geometry: 'box', origin: 'bottom'});
    const geometry = node.mesh().geometry;
    // Three.js y is up: the base sits at the pivot, the shape extends above.
    expect(bounds(geometry).min.y).toBeCloseTo(0);
    expect(bounds(geometry).max.y).toBeCloseTo(1);
  });

  test('a rounded box bakes its proportions and scales uniformly', () => {
    const node = new Mesh3D({
      geometry: 'box',
      radius: 20,
      size: [200, 400, 100],
    });
    const mesh = node.mesh();
    expect(mesh.scale.toArray()).toEqual([200, 200, 200]);
    const size = extents(mesh.geometry);
    expect(size.x).toBeCloseTo(1, 3);
    expect(size.y).toBeCloseTo(2, 3);
    expect(size.z).toBeCloseTo(0.5, 3);
  });

  test('a rounded box re-derives face UVs', () => {
    const node = new Mesh3D({geometry: 'box', radius: 30, size: 200});
    const geometry = node.mesh().geometry;
    expect(geometry.groups).toHaveLength(6);
    const front = geometry.groups[4];
    const uv = geometry.attributes.uv.array;
    let min = Infinity;
    let max = -Infinity;
    for (let i = front.start; i < front.start + front.count; i++) {
      min = Math.min(min, uv[i * 2], uv[i * 2 + 1]);
      max = Math.max(max, uv[i * 2], uv[i * 2 + 1]);
    }
    // The UVs follow the deformed positions: the flat face spans almost the
    // whole 0..1 range, and the rounded band curving away at the silhouette
    // forms a small, symmetric margin (BoxGeometry's own UV grid would have
    // squeezed the whole face into one cell of the subdivision).
    expect(min).toBeGreaterThanOrEqual(0);
    expect(min).toBeLessThan(0.1);
    expect(max).toBeLessThanOrEqual(1);
    expect(1 - max).toBeCloseTo(min, 3);
  });

  test('a custom geometry is used as is', () => {
    const custom = new THREE.BoxGeometry(50, 60, 70);
    const node = new Mesh3D({geometry: custom, size: 999});
    expect(node.mesh().geometry).toBe(custom);
    expect(node.mesh().scale.toArray()).toEqual([1, 1, 1]);
  });
});

describe('Mesh3D material', () => {
  test('colour alpha multiplies the node opacity', () => {
    const node = new Mesh3D({color: 'rgba(255, 0, 0, 0.5)', opacity: 0.5});
    const material = node.mesh().material as THREE.MeshStandardMaterial;
    expect(material.color.getHexString()).toBe('ff0000');
    expect(material.opacity).toBeCloseTo(0.25);
    expect(material.transparent).toBe(true);
  });

  test('an opaque mesh is not marked transparent', () => {
    const node = new Mesh3D({color: '#00ff00'});
    const material = node.mesh().material as THREE.MeshStandardMaterial;
    expect(material.opacity).toBe(1);
    expect(material.transparent).toBe(false);
  });

  test('switching the material kind swaps the material', () => {
    const node = new Mesh3D({material: 'standard'});
    expect(node.mesh().material).toBeInstanceOf(THREE.MeshStandardMaterial);
    node.material('basic');
    expect(node.mesh().material).toBeInstanceOf(THREE.MeshBasicMaterial);
  });
});
