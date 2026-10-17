import * as THREE from 'three';
import {describe, expect, test} from 'vitest';
import {Mesh3D, clayWhiteMix, normalizeMesh3DSize} from './Mesh3D';
import {configureThree} from './loader';
import {mockScene2D} from './testScene';

mockScene2D();
configureThree({module: THREE});

function extents(geometry: THREE.BufferGeometry): THREE.Vector3 {
  geometry.computeBoundingBox();
  return geometry.boundingBox!.getSize(new THREE.Vector3());
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
    geometry.computeBoundingBox();
    // Three.js y is up: the base sits at the pivot, the shape extends above.
    expect(geometry.boundingBox!.min.y).toBeCloseTo(0);
    expect(geometry.boundingBox!.max.y).toBeCloseTo(1);
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

  test('a rounded box re-derives face UVs and adds a surface group', () => {
    const node = new Mesh3D({geometry: 'box', radius: 30, size: 200});
    const geometry = node.mesh().geometry;
    // Six faces plus the extra front-face group for surface content.
    expect(geometry.groups).toHaveLength(7);
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

  test('`shadow` is a translucent black shadow catcher', () => {
    const node = new Mesh3D({material: 'shadow', opacity: 0.3});
    const material = node.mesh().material as THREE.ShadowMaterial;
    expect(material).toBeInstanceOf(THREE.ShadowMaterial);
    // The default white `color` would make an invisible shadow.
    expect(material.color.getHexString()).toBe('000000');
    expect(material.opacity).toBeCloseTo(0.3);
    expect(material.transparent).toBe(true);
  });

  test('`shadow` stays transparent at full opacity and takes a tint', () => {
    // Every other kind turns opaque at full opacity...
    const node = new Mesh3D({material: 'standard'});
    expect((node.mesh().material as THREE.Material).transparent).toBe(false);
    // ...but an opaque catcher would paint the whole plane in its colour.
    node.material('shadow');
    node.color('#336699');
    const material = node.mesh().material as THREE.ShadowMaterial;
    expect(material.opacity).toBe(1);
    expect(material.transparent).toBe(true);
    expect(material.color.getHexString()).toBe('336699');
    node.opacity(0.4);
    node.mesh();
    node.opacity(1);
    expect((node.mesh().material as THREE.Material).transparent).toBe(true);
  });

  test('a shadow catcher draws before other transparent meshes', () => {
    const node = new Mesh3D({material: 'shadow'});
    expect(node.mesh().renderOrder).toBe(-1);
    node.material('standard');
    expect(node.mesh().renderOrder).toBe(0);
    expect(new Mesh3D({geometry: 'plane'}).mesh().renderOrder).toBe(0);
  });

  test('switching the material kind swaps the material', () => {
    const node = new Mesh3D({material: 'standard'});
    expect(node.mesh().material).toBeInstanceOf(THREE.MeshStandardMaterial);
    node.material('basic');
    expect(node.mesh().material).toBeInstanceOf(THREE.MeshBasicMaterial);
  });
});

/** Run a material's `onBeforeCompile` on its stock shader source. */
function compile(material: THREE.Material, lib: keyof typeof THREE.ShaderLib) {
  const shader = {
    vertexShader: THREE.ShaderLib[lib].vertexShader,
    fragmentShader: THREE.ShaderLib[lib].fragmentShader,
    uniforms: {} as Record<string, THREE.IUniform>,
  };
  material.onBeforeCompile(
    shader as unknown as THREE.WebGLProgramParametersWithUniforms,
    {} as THREE.WebGLRenderer,
  );
  return shader;
}

describe('Mesh3D material presets', () => {
  test('`clay` is a rough, sheened physical material with a rim', () => {
    const node = new Mesh3D({material: 'clay', color: '#ffff00'});
    const material = node.mesh().material as THREE.MeshPhysicalMaterial;
    expect(material).toBeInstanceOf(THREE.MeshPhysicalMaterial);
    expect(material.roughness).toBeCloseTo(0.88);
    expect(material.metalness).toBe(0);
    expect(material.sheen).toBeGreaterThan(0.2);
    expect(material.sheenRoughness).toBeCloseTo(0.8);
    // Sheen halfway from a light body colour to white.
    expect(material.sheenColor.r).toBeCloseTo(1);
    expect(material.sheenColor.b).toBeCloseTo(0.5);
    expect(material.transparent).toBe(false);
    const {fragmentShader} = compile(material, 'physical');
    expect(fragmentShader).toContain('mcRim');
    expect(fragmentShader.indexOf('mcRim')).toBeLessThan(
      fragmentShader.indexOf('#include <opaque_fragment>'),
    );
  });

  test('`clay` tones down sheen and rim on dark colours', () => {
    expect(clayWhiteMix(0)).toBeCloseTo(0.25);
    expect(clayWhiteMix(0.2)).toBeCloseTo(0.25);
    expect(clayWhiteMix(0.35)).toBeCloseTo(0.375);
    expect(clayWhiteMix(0.5)).toBeCloseTo(0.5);
    expect(clayWhiteMix(1)).toBeCloseTo(0.5);

    const node = new Mesh3D({material: 'clay', color: '#000000'});
    const material = node.mesh().material as THREE.MeshPhysicalMaterial;
    // A quarter of the way to white on black...
    expect(material.sheenColor.toArray()).toEqual([0.25, 0.25, 0.25]);
    // ...and recomputed when the colour changes.
    node.color('#ffffff');
    node.mesh();
    expect(material.sheenColor.toArray()).toEqual([1, 1, 1]);
    node.color('#ff00ff');
    node.mesh();
    expect(material.sheenColor.g).toBeCloseTo(clayWhiteMix(0.2126 + 0.0722));

    const {fragmentShader} = compile(material, 'physical');
    expect(fragmentShader).toContain(
      'mcRim *= mix( 0.35, 1.0, smoothstep( 0.05, 0.5, mcLuma ) )',
    );
  });

  test('preset surface defaults yield to explicit values', () => {
    const node = new Mesh3D({material: 'clay', roughness: 0.3, metalness: 0.5});
    const material = node.mesh().material as THREE.MeshPhysicalMaterial;
    expect(material.roughness).toBeCloseTo(0.3);
    expect(material.metalness).toBeCloseTo(0.5);
    // Existing kinds keep their old defaults.
    const standard = new Mesh3D({}).mesh()
      .material as THREE.MeshStandardMaterial;
    expect(standard.roughness).toBeCloseTo(0.55);
    expect(standard.metalness).toBeCloseTo(0.1);
  });

  test('`glass` is a clear, depth-less shell drawn last', () => {
    const node = new Mesh3D({material: 'glass', color: '#38bdf8'});
    const mesh = node.mesh();
    const material = mesh.material as THREE.MeshStandardMaterial;
    expect(material.transparent).toBe(true);
    expect(material.depthWrite).toBe(false);
    expect(material.opacity).toBe(1);
    expect(mesh.renderOrder).toBe(1);
    node.opacity(0.5);
    expect((node.mesh().material as THREE.Material).opacity).toBeCloseTo(0.5);
    node.opacity(1);
    expect((node.mesh().material as THREE.Material).transparent).toBe(true);
    const {fragmentShader} = compile(material, 'physical');
    expect(fragmentShader).toContain('mcEdge');
    expect(fragmentShader).not.toContain('mcRim');
    node.material('standard');
    expect(node.mesh().renderOrder).toBe(0);
  });

  test('`glass` casts no shadow until `castShadow` is set', () => {
    const node = new Mesh3D({material: 'glass'});
    expect(node.mesh().castShadow).toBe(false);
    expect(node.mesh().receiveShadow).toBe(true);
    node.material('standard');
    expect(node.mesh().castShadow).toBe(true);
    node.material('glass');
    node.castShadow(true);
    expect(node.mesh().castShadow).toBe(true);
    expect(
      new Mesh3D({material: 'glass', castShadow: true}).mesh().castShadow,
    ).toBe(true);
    expect(new Mesh3D({material: 'clay'}).mesh().castShadow).toBe(true);
    expect(
      new Mesh3D({material: 'clay', castShadow: false}).mesh().castShadow,
    ).toBe(false);
  });

  test('every variant has its own program cache key', () => {
    const keys = (['standard', 'clay', 'glass'] as const).map(kind =>
      (
        new Mesh3D({material: kind}).mesh().material as THREE.Material
      ).customProgramCacheKey(),
    );
    expect(new Set(keys).size).toBe(3);
    const node = new Mesh3D({material: 'clay'});
    const material = node.mesh().material as THREE.Material;
    const before = material.customProgramCacheKey();
    node.reveal(0.5);
    node.mesh();
    expect(material.customProgramCacheKey()).not.toBe(before);
    expect(material.customProgramCacheKey()).toContain('reveal');
    node.reveal(1);
    node.mesh();
    expect(material.customProgramCacheKey()).toBe(before);
  });

  test('switching the material disposes the old one', () => {
    const node = new Mesh3D({material: 'clay'});
    const old = node.mesh().material as THREE.Material;
    let disposed = false;
    old.addEventListener('dispose', () => (disposed = true));
    node.material('glass');
    expect(node.mesh().material).not.toBe(old);
    expect(disposed).toBe(true);
  });
});

describe('Mesh3D reveal', () => {
  test('a revealed mesh compiles the stock shader', () => {
    const node = new Mesh3D({material: 'standard'});
    const material = node.mesh().material as THREE.Material;
    const shader = compile(material, 'physical');
    expect(shader.fragmentShader).toBe(THREE.ShaderLib.physical.fragmentShader);
    expect(shader.vertexShader).toBe(THREE.ShaderLib.physical.vertexShader);
    expect(node.mesh().customDepthMaterial).toBeUndefined();
    // The uniforms are present anyway, for a cached reveal program.
    expect(shader.uniforms.uMcRevealT).toBeDefined();
  });

  test('a partial reveal compiles the dissolve and drives its uniforms', () => {
    const node = new Mesh3D({
      geometry: 'box',
      size: [300, 150, 60],
      color: '#ff0000',
      reveal: 0.5,
    });
    const mesh = node.mesh();
    const material = mesh.material as THREE.Material;
    const version = material.version;
    const shader = compile(material, 'physical');
    expect(shader.vertexShader).toContain('vMcRevealPos = transformed');
    expect(shader.fragmentShader).toContain('discard');
    // The glowing edge is painted after tone mapping.
    const glow = shader.fragmentShader.indexOf('mcGlow');
    expect(glow).toBeGreaterThan(
      shader.fragmentShader.indexOf('#include <tonemapping_fragment>'),
    );
    expect(glow).toBeLessThan(
      shader.fragmentShader.indexOf('#include <colorspace_fragment>'),
    );

    const uniforms = shader.uniforms;
    expect(uniforms.uMcRevealT.value).toBeCloseTo(0.5 * 1.12);
    // Follows `color` until revealColor is set.
    expect(uniforms.uMcRevealColor.value.getHexString()).toBe('ff0000');
    // Isotropic in pixels: 3 cells across the largest dimension.
    expect(uniforms.uMcRevealFreq.value.toArray()).toEqual([3, 1.5, 0.6]);

    node.reveal(0.25);
    node.revealColor('#00ff00');
    node.mesh();
    expect(uniforms.uMcRevealT.value).toBeCloseTo(0.25 * 1.12);
    expect(uniforms.uMcRevealColor.value.getHexString()).toBe('00ff00');
    // A uniform change does not recompile.
    expect(material.version).toBe(version);
  });

  test('near-white and near-black meshes default to an amber edge', () => {
    const edge = (props: ConstructorParameters<typeof Mesh3D>[0]) => {
      const node = new Mesh3D({...props, reveal: 0.5});
      const shader = compile(
        node.mesh().material as THREE.Material,
        'physical',
      );
      return shader.uniforms.uMcRevealColor.value.getHexString();
    };
    expect(edge({color: '#ffffff'})).toBe('f59e0b');
    expect(edge({color: '#f5f5f4'})).toBe('f59e0b');
    expect(edge({color: '#000000'})).toBe('f59e0b');
    expect(edge({color: '#111827'})).toBe('f59e0b');
    // slate-800 (luma ~0.157) is dark enough for the accent too.
    expect(edge({color: '#1e293b'})).toBe('f59e0b');
    // Mid colours keep following `color`; an explicit value always wins.
    expect(edge({color: '#3b82f6'})).toBe('3b82f6');
    expect(edge({color: '#ffffff', revealColor: '#ff00ff'})).toBe('ff00ff');
  });

  test('the shadow pass dissolves with the mesh', () => {
    const node = new Mesh3D({reveal: 0.5});
    const mesh = node.mesh();
    const depth = mesh.customDepthMaterial!;
    expect(depth).toBeInstanceOf(THREE.MeshDepthMaterial);
    expect(mesh.customDistanceMaterial).toBeInstanceOf(
      THREE.MeshDistanceMaterial,
    );
    const shader = compile(depth, 'depth');
    expect(shader.fragmentShader).toContain('discard');
    // Only the cut: no colour in a depth pass.
    expect(shader.fragmentShader).not.toContain('mcGlow');
    const body = compile(mesh.material as THREE.Material, 'physical');
    expect(shader.uniforms.uMcRevealT).toBe(body.uniforms.uMcRevealT);

    let disposed = false;
    depth.addEventListener('dispose', () => (disposed = true));
    node.reveal(1);
    expect(node.mesh().customDepthMaterial).toBeUndefined();
    node.dispose();
    expect(disposed).toBe(true);
  });

  test('reveal 0 hides the mesh but not its 3D children', () => {
    const node = new Mesh3D({reveal: 0});
    expect(node.mesh().visible).toBe(false);
    expect(node.object3D().visible).toBe(true);
    node.reveal(0.01);
    expect(node.mesh().visible).toBe(true);
  });

  test('a shadow catcher ignores reveal', () => {
    const node = new Mesh3D({material: 'shadow', reveal: 0});
    const mesh = node.mesh();
    expect(mesh.visible).toBe(true);
    expect(mesh.customDepthMaterial).toBeUndefined();
    expect(
      (mesh.material as THREE.Material).customProgramCacheKey(),
    ).not.toContain('motion-canvas');
  });

  test('reveal works on unlit and glass materials', () => {
    for (const [kind, lib] of [
      ['basic', 'basic'],
      ['glass', 'physical'],
      ['toon', 'toon'],
    ] as const) {
      const node = new Mesh3D({material: kind, reveal: 0.3});
      const shader = compile(node.mesh().material as THREE.Material, lib);
      expect(shader.fragmentShader).toContain('discard');
      expect(shader.fragmentShader).toContain('mcGlow');
    }
  });
});

describe('Mesh3D shadow pass', () => {
  // three.js draws receivers into a VSM shadow map even with castShadow off.
  const isSilent = (material: THREE.Material | undefined) => {
    expect(material).toBeDefined();
    const shader = compile(material!, 'depth');
    return (
      shader.fragmentShader.includes('void main() {\n\tdiscard;') &&
      !material!.colorWrite &&
      !material!.depthWrite
    );
  };

  test('a receiving mesh with castShadow off writes nothing', () => {
    const glass = new Mesh3D({material: 'glass'});
    const mesh = glass.mesh();
    expect(mesh.castShadow).toBe(false);
    expect(mesh.receiveShadow).toBe(true);
    expect(isSilent(mesh.customDepthMaterial)).toBe(true);
    expect(mesh.customDistanceMaterial).toBeInstanceOf(
      THREE.MeshDistanceMaterial,
    );
    expect(isSilent(mesh.customDistanceMaterial)).toBe(true);

    // Any material, not only glass; the pair is shared.
    const plain = new Mesh3D({castShadow: false});
    expect(plain.mesh().customDepthMaterial).toBe(mesh.customDepthMaterial);
    plain.dispose();
    glass.dispose();
  });

  test('casting meshes and non-receivers keep the default shadow pass', () => {
    expect(new Mesh3D({}).mesh().customDepthMaterial).toBeUndefined();
    expect(
      new Mesh3D({material: 'glass', castShadow: true}).mesh()
        .customDepthMaterial,
    ).toBeUndefined();
    expect(
      new Mesh3D({castShadow: false, receiveShadow: false}).mesh()
        .customDepthMaterial,
    ).toBeUndefined();
    // The shadow catcher keeps casting (VSM needs it in the map).
    const catcher = new Mesh3D({material: 'shadow', receiveShadow: true});
    expect(catcher.mesh().castShadow).toBe(true);
    expect(catcher.mesh().customDepthMaterial).toBeUndefined();
  });

  test('castShadow off wins over the reveal shadow pass', () => {
    const node = new Mesh3D({castShadow: false, reveal: 0.5});
    const silent = node.mesh().customDepthMaterial;
    expect(isSilent(silent)).toBe(true);
    // Back on: the dissolve's own shadow materials take over.
    node.castShadow(true);
    const depth = node.mesh().customDepthMaterial!;
    expect(depth).not.toBe(silent);
    expect(compile(depth, 'depth').fragmentShader).toContain('uMcRevealT');
    node.castShadow(false);
    expect(isSilent(node.mesh().customDepthMaterial)).toBe(true);
    node.dispose();
  });

  test('restores the default pass and disposes the shared pair', () => {
    const a = new Mesh3D({castShadow: false});
    const b = new Mesh3D({castShadow: false});
    const shared = a.mesh().customDepthMaterial!;
    b.mesh();
    let disposed = false;
    shared.addEventListener('dispose', () => (disposed = true));

    a.castShadow(true);
    expect(a.mesh().customDepthMaterial).toBeUndefined();
    expect(a.mesh().customDistanceMaterial).toBeUndefined();
    expect(disposed).toBe(false);
    b.receiveShadow(false);
    expect(b.mesh().customDepthMaterial).toBeUndefined();
    expect(disposed).toBe(true);

    // A fresh pair after the last release; dispose releases it too.
    const c = new Mesh3D({castShadow: false});
    const next = c.mesh().customDepthMaterial!;
    expect(next).not.toBe(shared);
    let nextDisposed = false;
    next.addEventListener('dispose', () => (nextDisposed = true));
    c.dispose();
    expect(nextDisposed).toBe(true);
    a.dispose();
    b.dispose();
  });
});
