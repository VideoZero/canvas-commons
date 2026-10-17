import type * as THREE from 'three';
import {ThreeModule} from './loader';

/**
 * Built-in environment maps for {@link Three.environment}.
 *
 * - `studio`: a soft, neutral photo-studio room — a large grey box lit by a
 *   few bright panels — prefiltered for image-based lighting. Gives matte
 *   materials gentle wrap-around light and glossy ones believable highlights
 *   without any visible backdrop.
 */
export type ThreeEnvironmentKind = 'studio';

/** A generated environment, or the marker of a generation that failed. */
type EnvironmentEntry =
  | {target: THREE.WebGLRenderTarget; failed?: undefined}
  | {failed: Error; target?: undefined};

/**
 * Generated environments, per renderer. PMREM targets belong to the WebGL
 * context they were rendered with, so they are cached per renderer and
 * released together with it ({@link disposeEnvironments}). A failure is
 * cached as well, so a broken context does not retry (and re-render the
 * room) on every frame; a fresh renderer starts over.
 */
const CACHE = new WeakMap<
  THREE.WebGLRenderer,
  Map<ThreeEnvironmentKind, EnvironmentEntry>
>();

/**
 * The prefiltered (PMREM) texture for a built-in environment, rendered on
 * first use with `renderer` and cached for it.
 *
 * @remarks
 * Rendering it switches render targets; call it before setting up the
 * viewport and clearing for a frame. Throws when generation fails, then and
 * on every later call for the same renderer.
 */
export function getEnvironmentTexture(
  three: ThreeModule,
  renderer: THREE.WebGLRenderer,
  kind: ThreeEnvironmentKind,
): THREE.Texture {
  let entries = CACHE.get(renderer);
  if (!entries) {
    entries = new Map();
    CACHE.set(renderer, entries);
  }
  let entry = entries.get(kind);
  if (!entry) {
    entry = generate(three, renderer, kind);
    entries.set(kind, entry);
  }
  if (entry.failed) {
    throw entry.failed;
  }
  return entry.target.texture;
}

function generate(
  three: ThreeModule,
  renderer: THREE.WebGLRenderer,
  kind: ThreeEnvironmentKind,
): EnvironmentEntry {
  // PMREMGenerator restores these itself, but not when it throws halfway.
  const target = renderer.getRenderTarget();
  const autoClear = renderer.autoClear;
  const toneMapping = renderer.toneMapping;
  const scene = createStudioEnvironmentScene(three);
  let pmrem: THREE.PMREMGenerator | null = null;
  try {
    pmrem = new three.PMREMGenerator(renderer);
    // A light blur softens the panel edges in the sharpest mip.
    const result = pmrem.fromScene(scene, 0.04);
    result.texture.name = `canvas-commons-environment-${kind}`;
    return {target: result};
  } catch (e) {
    renderer.setRenderTarget(target);
    renderer.autoClear = autoClear;
    renderer.toneMapping = toneMapping;
    return {failed: e instanceof Error ? e : new Error(String(e))};
  } finally {
    try {
      pmrem?.dispose();
    } finally {
      disposeScene(scene);
    }
  }
}

/**
 * Release the environments generated for `renderer` (render targets and
 * their textures) and forget any failure, so a new renderer starts over.
 */
export function disposeEnvironments(renderer: THREE.WebGLRenderer) {
  const entries = CACHE.get(renderer);
  if (!entries) {
    return;
  }
  for (const entry of entries.values()) {
    entry.target?.dispose();
  }
  CACHE.delete(renderer);
}

/**
 * A procedural photo-studio room: Three.js' example `RoomEnvironment` (r186,
 * MIT) rebuilt here so the core needs no addon — same layout, the props as
 * plain meshes instead of one instanced mesh. A big box seen from inside, a few grey props on the floor that
 * break up the reflections, and emissive panels — the brightest one overhead —
 * that act as soft boxes.
 *
 * @internal
 */
export function createStudioEnvironmentScene(three: ThreeModule): THREE.Scene {
  const scene = new three.Scene();
  // Lowers the room so the PMREM camera (at the origin) sits above the props
  // rather than among them.
  scene.position.y = -3.5;
  const geometry = new three.BoxGeometry();
  geometry.deleteAttribute('uv');

  const roomMaterial = new three.MeshStandardMaterial({side: three.BackSide});
  const boxMaterial = new three.MeshStandardMaterial();

  const main = new three.PointLight(0xffffff, 900, 28, 2);
  main.position.set(0.418, 16.199, 0.3);
  scene.add(main);

  const room = new three.Mesh(geometry, roomMaterial);
  room.position.set(-0.757, 13.219, 0.717);
  room.scale.set(31.713, 28.305, 28.591);
  scene.add(room);

  const props: [number[], number, number[]][] = [
    [[-10.906, 2.009, 1.846], -0.195, [2.328, 7.905, 4.651]],
    [[-5.607, -0.754, -0.758], 0.994, [1.97, 1.534, 3.955]],
    [[6.167, 0.857, 7.803], 0.561, [3.927, 6.285, 3.687]],
    [[-2.017, 0.018, 6.124], 0.333, [2.002, 4.566, 2.064]],
    [[2.291, -0.756, -2.621], -0.286, [1.546, 1.552, 1.496]],
    [[-2.193, -0.369, -5.547], 0.516, [3.875, 3.487, 2.986]],
  ];
  for (const [[x, y, z], rotationY, [sx, sy, sz]] of props) {
    const box = new three.Mesh(geometry, boxMaterial);
    box.position.set(x, y, z);
    box.rotation.set(0, rotationY, 0);
    box.scale.set(sx, sy, sz);
    scene.add(box);
  }

  // Emissive panels, far brighter than white, so they light the room like
  // soft boxes once prefiltered.
  const panels: [number, number[], number[]][] = [
    [50, [-16.116, 14.37, 8.208], [0.1, 2.428, 2.739]],
    [50, [-16.109, 18.021, -8.207], [0.1, 2.425, 2.751]],
    [17, [14.904, 12.198, -1.832], [0.15, 4.265, 6.331]],
    [43, [-0.462, 8.89, 14.52], [4.38, 5.441, 0.088]],
    [20, [3.235, 11.486, -12.541], [2.5, 2.0, 0.1]],
    [100, [0, 20, 0], [1, 0.1, 1]],
  ];
  for (const [intensity, [x, y, z], [sx, sy, sz]] of panels) {
    const material = new three.MeshLambertMaterial({
      color: 0x000000,
      emissive: 0xffffff,
      emissiveIntensity: intensity,
    });
    const panel = new three.Mesh(geometry, material);
    panel.position.set(x, y, z);
    panel.scale.set(sx, sy, sz);
    scene.add(panel);
  }

  return scene;
}

function disposeScene(scene: THREE.Scene) {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  scene.traverse(object => {
    const mesh = object as THREE.Mesh;
    if (mesh.isMesh) {
      geometries.add(mesh.geometry);
      for (const material of Array.isArray(mesh.material)
        ? mesh.material
        : [mesh.material]) {
        materials.add(material);
      }
    }
    if ((object as THREE.Light).isLight) {
      (object as THREE.Light).dispose();
    }
  });
  geometries.forEach(geometry => geometry.dispose());
  materials.forEach(material => material.dispose());
}
