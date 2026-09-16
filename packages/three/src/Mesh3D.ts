import {
  colorSignal,
  computed,
  initial,
  interpolation,
  nodeName,
  signal,
} from '@motion-canvas/2d';
import {
  ColorSignal,
  DependencyContext,
  PossibleColor,
  SignalValue,
  SimpleSignal,
} from '@motion-canvas/core';
import type * as THREE from 'three';
import {Object3DNode, Object3DNodeProps} from './Object3DNode';
import {ThreeModule, getThree} from './loader';

/**
 * Built-in primitive shapes. Every primitive is authored at unit size and
 * scaled to {@link Mesh3D.size}, so tweening the size never rebuilds geometry.
 */
export type Mesh3DGeometry =
  | 'box'
  | 'sphere'
  | 'plane'
  | 'circle'
  | 'cylinder'
  | 'cone'
  | 'torus'
  | 'capsule'
  | 'ring'
  | 'icosahedron'
  | 'octahedron'
  | 'dodecahedron'
  | 'tetrahedron'
  | 'torusKnot';

/**
 * Where the node's pivot sits on the shape. `center` (default) is the
 * middle; `bottom` puts the pivot on the bottom face so the shape grows
 * upward when its height changes and tilts around its base. A
 * `[x, y, z]` tuple in `-1..1` (like a 2D `offset`) picks any point:
 * `[0, 1, 0]` is `bottom`, `[-1, 1, 0]` bottom-left, `[0, 0, 1]` front.
 */
export type Mesh3DOrigin =
  | 'center'
  | 'top'
  | 'bottom'
  | 'left'
  | 'right'
  | 'front'
  | 'back'
  | [number, number, number];

/**
 * Built-in material kinds.
 *
 * - `standard` (default): physically based, reacts to lights, `metalness` /
 *   `roughness`.
 * - `physical`: `standard` plus clearcoat-style extras, for glossy hero
 *   objects.
 * - `phong` / `lambert`: classic shiny / matte shading, cheaper.
 * - `toon`: stepped cel shading.
 * - `basic`: unlit flat colour — ignores lights entirely.
 * - `normal`: debug rainbow from surface normals.
 */
export type Mesh3DMaterial =
  | 'standard'
  | 'physical'
  | 'phong'
  | 'lambert'
  | 'toon'
  | 'basic'
  | 'normal';

export type Mesh3DSide = 'front' | 'back' | 'double';

/**
 * Size in pixels: a single number, `[width, height]` or
 * `[width, height, depth]`. Missing dimensions repeat the width.
 */
export type PossibleMesh3DSize = number | [number, number] | [number, number, number];

export interface Mesh3DProps extends Object3DNodeProps {
  /**
   * {@inheritDoc Mesh3D.geometry}
   */
  geometry?: SignalValue<Mesh3DGeometry | THREE.BufferGeometry>;
  /**
   * {@inheritDoc Mesh3D.size}
   */
  size?: SignalValue<PossibleMesh3DSize>;
  /**
   * {@inheritDoc Mesh3D.radius}
   */
  radius?: SignalValue<number>;
  /**
   * {@inheritDoc Mesh3D.origin}
   */
  origin?: SignalValue<Mesh3DOrigin>;
  /**
   * {@inheritDoc Mesh3D.segments}
   */
  segments?: SignalValue<number>;
  /**
   * {@inheritDoc Mesh3D.material}
   */
  material?: SignalValue<Mesh3DMaterial | THREE.Material>;
  /**
   * {@inheritDoc Mesh3D.color}
   */
  color?: SignalValue<PossibleColor>;
  /**
   * {@inheritDoc Mesh3D.emissive}
   */
  emissive?: SignalValue<PossibleColor>;
  /**
   * {@inheritDoc Mesh3D.emissiveIntensity}
   */
  emissiveIntensity?: SignalValue<number>;
  /**
   * {@inheritDoc Mesh3D.metalness}
   */
  metalness?: SignalValue<number>;
  /**
   * {@inheritDoc Mesh3D.roughness}
   */
  roughness?: SignalValue<number>;
  /**
   * {@inheritDoc Mesh3D.wireframe}
   */
  wireframe?: SignalValue<boolean>;
  /**
   * {@inheritDoc Mesh3D.flatShading}
   */
  flatShading?: SignalValue<boolean>;
  /**
   * {@inheritDoc Mesh3D.side}
   */
  side?: SignalValue<Mesh3DSide>;
  /**
   * {@inheritDoc Mesh3D.map}
   */
  map?: SignalValue<string | null>;
  /**
   * {@inheritDoc Mesh3D.castShadow}
   */
  castShadow?: SignalValue<boolean>;
  /**
   * {@inheritDoc Mesh3D.receiveShadow}
   */
  receiveShadow?: SignalValue<boolean>;
}

interface TextureEntry {
  texture: THREE.Texture;
  promise: Promise<THREE.Texture>;
  ready: boolean;
}

const textures = new Map<string, TextureEntry>();

/**
 * Expand a size shorthand to `[width, height, depth]`.
 */
export function normalizeMesh3DSize(
  size: PossibleMesh3DSize,
): [number, number, number] {
  if (typeof size === 'number') {
    return [size, size, size];
  }
  if (size.length === 2) {
    return [size[0], size[1], size[0]];
  }
  return [size[0], size[1], size[2]];
}

function sizeLerp(
  from: PossibleMesh3DSize,
  to: PossibleMesh3DSize,
  value: number,
): PossibleMesh3DSize {
  const a = normalizeMesh3DSize(from);
  const b = normalizeMesh3DSize(to);
  return [
    a[0] + (b[0] - a[0]) * value,
    a[1] + (b[1] - a[1]) * value,
    a[2] + (b[2] - a[2]) * value,
  ];
}

/**
 * A solid 3D shape.
 *
 * @remarks
 * Pick a {@link geometry} primitive, give it a {@link size} in pixels and a
 * {@link color}; it is lit by the {@link Light3D} nodes in the scene (or the
 * default light rig of {@link Three} when there are none). Every visual
 * property is a signal, so it tweens.
 *
 * @example
 * ```tsx
 * <Three width={800} height={600} cameraPitch={20} cameraYaw={-30}>
 *   <Mesh3D ref={box} geometry="box" size={[240, 240, 240]} color="#3b82f6" />
 * </Three>
 * // ...
 * yield* all(box().rotationY(90, 1), box().color('#f97316', 1));
 * ```
 */
@nodeName('Mesh3D')
export class Mesh3D extends Object3DNode {
  /**
   * The primitive to draw, or a custom Three.js `BufferGeometry`.
   *
   * @remarks
   * A custom geometry is used as is: author it in pixels (y up, like any
   * Three.js geometry); {@link size}, {@link radius} and {@link origin} are
   * ignored for it. For a custom object with its own materials or children
   * use {@link Object3D} instead.
   */
  @initial('box')
  @signal()
  public declare readonly geometry: SimpleSignal<
    Mesh3DGeometry | THREE.BufferGeometry,
    this
  >;

  /**
   * Size in pixels — a number, `[width, height]` or `[width, height, depth]`.
   *
   * @remarks
   * For round shapes the width is the diameter. `torus` / `torusKnot`:
   * `[outer diameter, tube diameter]`. `capsule`: `[diameter, total length]`.
   * `ring`: `[outer diameter, inner diameter]`. `cylinder` / `cone`:
   * `[diameter, height]`.
   */
  @initial(200)
  @interpolation(sizeLerp)
  @signal()
  public declare readonly size: SimpleSignal<PossibleMesh3DSize, this>;

  /**
   * Corner radius in pixels for `box` — a rounded slab or a pill-shaped
   * block. Clamped to half the smallest dimension.
   */
  @initial(0)
  @signal()
  public declare readonly radius: SimpleSignal<number, this>;

  /**
   * Where the pivot sits on the shape; see {@link Mesh3DOrigin}.
   *
   * @remarks
   * `origin="bottom"` is the one to use for bars and objects standing on a
   * floor: `y` then places the base, tweening the height in {@link size}
   * grows the shape upward, and `rotationX` tips it over from its base.
   */
  @initial('center')
  @signal()
  public declare readonly origin: SimpleSignal<Mesh3DOrigin, this>;

  /**
   * Tessellation of curved primitives. Higher is smoother and heavier.
   */
  @initial(48)
  @signal()
  public declare readonly segments: SimpleSignal<number, this>;

  /**
   * Shading model, or a custom Three.js material (then colour props are left
   * to you).
   */
  @initial('standard')
  @signal()
  public declare readonly material: SimpleSignal<
    Mesh3DMaterial | THREE.Material,
    this
  >;

  /**
   * Surface colour. Alpha multiplies the node's `opacity`.
   */
  @initial('#ffffff')
  @colorSignal()
  public declare readonly color: ColorSignal<this>;

  /**
   * Self-illumination colour (glows regardless of lights).
   */
  @initial('#000000')
  @colorSignal()
  public declare readonly emissive: ColorSignal<this>;

  /**
   * Strength of the {@link emissive} glow.
   */
  @initial(1)
  @signal()
  public declare readonly emissiveIntensity: SimpleSignal<number, this>;

  /**
   * 0 = dielectric (plastic, wood), 1 = metal. `standard` / `physical` only.
   */
  @initial(0.1)
  @signal()
  public declare readonly metalness: SimpleSignal<number, this>;

  /**
   * 0 = mirror-sharp highlights, 1 = fully matte. `standard` / `physical` only.
   */
  @initial(0.55)
  @signal()
  public declare readonly roughness: SimpleSignal<number, this>;

  /**
   * Draw only the edges of the triangles.
   */
  @initial(false)
  @signal()
  public declare readonly wireframe: SimpleSignal<boolean, this>;

  /**
   * Faceted, low-poly look instead of smooth shading.
   */
  @initial(false)
  @signal()
  public declare readonly flatShading: SimpleSignal<boolean, this>;

  /**
   * Which faces render. Use `double` for planes seen from behind or open
   * shapes.
   */
  @initial('front')
  @signal()
  public declare readonly side: SimpleSignal<Mesh3DSide, this>;

  /**
   * URL of an image to wrap around the surface. Loads asynchronously; the
   * renderer waits for it like it does for {@link Img}.
   */
  @initial(null)
  @signal()
  public declare readonly map: SimpleSignal<string | null, this>;

  /**
   * Whether this mesh casts shadows (needs `shadows` on the {@link Three}
   * node and a shadow-casting light).
   */
  @initial(true)
  @signal()
  public declare readonly castShadow: SimpleSignal<boolean, this>;

  /**
   * Whether shadows fall onto this mesh.
   */
  @initial(true)
  @signal()
  public declare readonly receiveShadow: SimpleSignal<boolean, this>;

  private ownGeometry: THREE.BufferGeometry | null = null;
  private ownGeometryKey = '';
  private ownMaterial: THREE.Material | null = null;
  private ownMaterialKind: Mesh3DMaterial | null = null;

  public constructor(props?: Mesh3DProps) {
    super(props ?? {});
  }

  protected override createObject(three: ThreeModule): THREE.Object3D {
    return new three.Mesh();
  }

  protected override updateObject(three: ThreeModule, object: THREE.Object3D) {
    const mesh = object as THREE.Mesh;
    mesh.geometry = this.resolvedGeometry();
    mesh.material = this.resolvedMaterial();
    mesh.castShadow = this.castShadow();
    mesh.receiveShadow = this.receiveShadow();

    // Size is applied as scale on top of the node's own scale, so primitives
    // stay unit-sized and tweening `size` never rebuilds geometry.
    const [sx, sy, sz] = this.geometryScale();
    object.scale.multiply(new three.Vector3(sx, sy, sz));
  }

  /**
   * Normalised `[width, height, depth]` in pixels.
   */
  @computed()
  public size3(): [number, number, number] {
    return normalizeMesh3DSize(this.size());
  }

  @computed()
  private geometryScale(): [number, number, number] {
    const geometry = this.geometry();
    const [w, h, d] = this.size3();
    if (typeof geometry !== 'string') {
      return [1, 1, 1];
    }
    switch (geometry) {
      case 'box':
        // A rounded box bakes its proportions (see resolvedGeometry).
        return this.radius() > 0 ? [w, w, w] : [w, h, d];
      case 'plane':
        return [w, h, 1];
      case 'cylinder':
      case 'cone':
        return [w, h, w];
      // Shapes whose proportions are baked into the unit geometry scale
      // uniformly by their width.
      case 'torus':
      case 'torusKnot':
      case 'capsule':
      case 'ring':
      case 'sphere':
      case 'circle':
      case 'icosahedron':
      case 'octahedron':
      case 'dodecahedron':
      case 'tetrahedron':
        return [w, w, w];
    }
  }

  @computed()
  private resolvedGeometry(): THREE.BufferGeometry {
    const geometry = this.geometry();
    if (typeof geometry !== 'string') {
      this.disposeOwnGeometry();
      return geometry;
    }

    const three = getThree();
    const segments = Math.max(3, Math.round(this.segments()));
    const [w, h, d] = this.size3();
    const width = Math.max(w, 1e-6);
    const round = (value: number) => Math.round(value * 1000) / 1000;
    // Only proportion-carrying shapes depend on the aspect ratio.
    const ratio =
      geometry === 'torus' ||
      geometry === 'torusKnot' ||
      geometry === 'capsule' ||
      geometry === 'ring'
        ? round(h / width)
        : 0;
    // A rounded box bakes all three proportions plus the corner radius.
    const rounded =
      geometry === 'box' && this.radius() > 0
        ? [round(h / width), round(d / width), round(this.radius() / width)]
        : null;
    const origin = originVector(this.origin());
    const key = `${geometry}:${segments}:${ratio}:${rounded}:${origin}`;
    if (this.ownGeometry && this.ownGeometryKey === key) {
      return this.ownGeometry;
    }

    this.disposeOwnGeometry();
    const unit = rounded
      ? createRoundedBox(three, 1, rounded[0], rounded[1], rounded[2], segments)
      : createUnitGeometry(three, geometry, segments, ratio);
    this.ownGeometry = applyOrigin(three, unit, origin);
    this.ownGeometryKey = key;
    return this.ownGeometry;
  }

  @computed()
  private resolvedMaterial(): THREE.Material {
    const material = this.material();
    if (typeof material !== 'string') {
      this.disposeOwnMaterial();
      return material;
    }

    const three = getThree();
    if (!this.ownMaterial || this.ownMaterialKind !== material) {
      this.disposeOwnMaterial();
      this.ownMaterial = createMaterial(three, material);
      this.ownMaterialKind = material;
    }

    const mat = this.ownMaterial as THREE.MeshStandardMaterial;
    const color = this.color();
    const opacity = this.opacity3D() * color.alpha();
    if ('color' in mat) {
      mat.color.set(color.hex());
    }
    if ('emissive' in mat) {
      mat.emissive.set(this.emissive().hex());
      mat.emissiveIntensity = this.emissiveIntensity();
    }
    if ('metalness' in mat) {
      mat.metalness = this.metalness();
      mat.roughness = this.roughness();
    }
    if ('wireframe' in mat) {
      mat.wireframe = this.wireframe();
    }
    if ('flatShading' in mat) {
      const flat = this.flatShading();
      if (mat.flatShading !== flat) {
        mat.flatShading = flat;
        mat.needsUpdate = true;
      }
    }
    if ('map' in mat) {
      const texture = this.texture();
      if (mat.map !== texture) {
        mat.map = texture;
        mat.needsUpdate = true;
      }
    }
    const side = this.side();
    mat.side =
      side === 'double'
        ? three.DoubleSide
        : side === 'back'
          ? three.BackSide
          : three.FrontSide;
    setTransparent(mat, opacity < 1);
    mat.opacity = opacity;
    return mat;
  }

  @computed()
  private texture(): THREE.Texture | null {
    const url = this.map();
    if (!url) {
      return null;
    }
    const three = getThree();
    let entry = textures.get(url);
    if (!entry) {
      const loader = new three.TextureLoader();
      loader.setCrossOrigin('anonymous');
      let texture!: THREE.Texture;
      const promise = new Promise<THREE.Texture>((resolve, reject) => {
        texture = loader.load(
          url,
          () => {
            created.ready = true;
            resolve(texture);
          },
          undefined,
          () => reject(new Error(`Failed to load texture: ${url}`)),
        );
      });
      texture.colorSpace = three.SRGBColorSpace;
      const created: TextureEntry = {texture, promise, ready: false};
      entry = created;
      textures.set(url, entry);
    }
    if (entry.ready) {
      return entry.texture;
    }
    return DependencyContext.collectPromise(entry.promise, null).value;
  }

  private disposeOwnGeometry() {
    this.ownGeometry?.dispose();
    this.ownGeometry = null;
    this.ownGeometryKey = '';
  }

  private disposeOwnMaterial() {
    this.ownMaterial?.dispose();
    this.ownMaterial = null;
    this.ownMaterialKind = null;
  }

  public override dispose() {
    this.disposeOwnGeometry();
    this.disposeOwnMaterial();
    super.dispose();
  }
}

function createUnitGeometry(
  three: ThreeModule,
  kind: Mesh3DGeometry,
  segments: number,
  ratio: number,
): THREE.BufferGeometry {
  const half = Math.max(2, Math.round(segments / 2));
  switch (kind) {
    case 'box':
      return new three.BoxGeometry(1, 1, 1);
    case 'sphere':
      return new three.SphereGeometry(0.5, segments, half);
    case 'plane':
      return new three.PlaneGeometry(1, 1);
    case 'circle':
      return new three.CircleGeometry(0.5, segments);
    case 'cylinder':
      return new three.CylinderGeometry(0.5, 0.5, 1, segments);
    case 'cone':
      return new three.ConeGeometry(0.5, 1, segments);
    case 'torus': {
      // Outer diameter 1; the tube diameter is `ratio` of it.
      const tube = Math.min(0.5, Math.max(0.01, ratio || 0.25)) / 2;
      return new three.TorusGeometry(0.5 - tube, tube, half, segments);
    }
    case 'capsule': {
      // Diameter 1; total length is `ratio` diameters (at least one).
      const length = Math.max(0, (ratio || 2) - 1);
      return new three.CapsuleGeometry(0.5, length, half, segments);
    }
    case 'ring': {
      const inner = Math.min(0.49, Math.max(0, (ratio || 0.5) / 2));
      return new three.RingGeometry(inner, 0.5, segments);
    }
    case 'icosahedron':
      return new three.IcosahedronGeometry(0.5);
    case 'octahedron':
      return new three.OctahedronGeometry(0.5);
    case 'dodecahedron':
      return new three.DodecahedronGeometry(0.5);
    case 'tetrahedron':
      return new three.TetrahedronGeometry(0.5);
    case 'torusKnot': {
      // Outer diameter 1; the tube diameter is `ratio` of it.
      const tube = Math.min(0.5, Math.max(0.01, ratio || 0.3)) / 2;
      return new three.TorusKnotGeometry(0.5 - tube, tube, segments * 3, half);
    }
  }
}

/**
 * A box with rounded edges — a port of Three's example `RoundedBoxGeometry`
 * (MIT): a subdivided box whose outer ring of vertices is pushed onto a
 * sphere of `radius` around the shrunken core. UVs stay those of the box.
 */
function createRoundedBox(
  three: ThreeModule,
  width: number,
  height: number,
  depth: number,
  radius: number,
  segments: number,
): THREE.BufferGeometry {
  const steps = Math.max(1, Math.round(segments / 8));
  const seg = steps * 2 + 1;
  const r = Math.min(width / 2, height / 2, depth / 2, radius);
  const geometry = new three.BoxGeometry(1, 1, 1, seg, seg, seg).toNonIndexed();
  const positions = geometry.attributes.position.array as Float32Array;
  const normals = geometry.attributes.normal.array as Float32Array;
  const box = new three.Vector3(width, height, depth)
    .divideScalar(2)
    .subScalar(r);
  const position = new three.Vector3();
  const normal = new three.Vector3();
  const halfSegment = 0.5 / seg;
  for (let i = 0; i < positions.length; i += 3) {
    position.fromArray(positions, i);
    normal.copy(position);
    normal.x -= Math.sign(normal.x) * halfSegment;
    normal.y -= Math.sign(normal.y) * halfSegment;
    normal.z -= Math.sign(normal.z) * halfSegment;
    normal.normalize();
    positions[i] = box.x * Math.sign(position.x) + normal.x * r;
    positions[i + 1] = box.y * Math.sign(position.y) + normal.y * r;
    positions[i + 2] = box.z * Math.sign(position.z) + normal.z * r;
    normals[i] = normal.x;
    normals[i + 1] = normal.y;
    normals[i + 2] = normal.z;
  }
  geometry.attributes.position.needsUpdate = true;
  geometry.attributes.normal.needsUpdate = true;
  return geometry;
}

function originVector(origin: Mesh3DOrigin): [number, number, number] {
  if (typeof origin !== 'string') {
    return origin;
  }
  switch (origin) {
    case 'top':
      return [0, -1, 0];
    case 'bottom':
      return [0, 1, 0];
    case 'left':
      return [-1, 0, 0];
    case 'right':
      return [1, 0, 0];
    case 'front':
      return [0, 0, 1];
    case 'back':
      return [0, 0, -1];
    default:
      return [0, 0, 0];
  }
}

/**
 * Shift the geometry so the point picked by `origin` (Motion Canvas axes:
 * y down, z toward the camera) lands on the pivot.
 */
function applyOrigin(
  three: ThreeModule,
  geometry: THREE.BufferGeometry,
  [ox, oy, oz]: [number, number, number],
): THREE.BufferGeometry {
  if (ox === 0 && oy === 0 && oz === 0) {
    return geometry;
  }
  geometry.computeBoundingBox();
  const bounds = geometry.boundingBox!;
  const center = new three.Vector3();
  const extent = new three.Vector3();
  bounds.getCenter(center);
  bounds.getSize(extent);
  geometry.translate(
    -(center.x + (ox * extent.x) / 2),
    -(center.y - (oy * extent.y) / 2),
    -(center.z + (oz * extent.z) / 2),
  );
  return geometry;
}

function createMaterial(three: ThreeModule, kind: Mesh3DMaterial): THREE.Material {
  switch (kind) {
    case 'standard':
      return new three.MeshStandardMaterial();
    case 'physical':
      return new three.MeshPhysicalMaterial();
    case 'phong':
      return new three.MeshPhongMaterial();
    case 'lambert':
      return new three.MeshLambertMaterial();
    case 'toon':
      return new three.MeshToonMaterial();
    case 'basic':
      return new three.MeshBasicMaterial();
    case 'normal':
      return new three.MeshNormalMaterial();
  }
}

/**
 * Flip `transparent` and recompile when it changes: Three bakes an `OPAQUE`
 * define into the program, so a plain assignment would not take effect.
 *
 * @internal
 */
export function setTransparent(material: THREE.Material, transparent: boolean) {
  if (material.transparent !== transparent) {
    material.transparent = transparent;
    material.needsUpdate = true;
  }
}
