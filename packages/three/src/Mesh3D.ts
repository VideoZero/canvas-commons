import {
  Layout,
  Node,
  View2D,
  colorSignal,
  computed,
  initial,
  interpolation,
  nodeName,
  signal,
} from '@motion-canvas/2d';
import {
  Color,
  ColorSignal,
  DependencyContext,
  PossibleColor,
  Scene,
  SignalValue,
  SimpleSignal,
  Vector2,
  endScene,
  startScene,
  useLogger,
  useScene,
} from '@motion-canvas/core';
import type * as THREE from 'three';
import {Object3DNode, Object3DNodeProps, isObject3DRoot} from './Object3DNode';
import {applyColor, colorLuma} from './color';
import {ThreeModule, getThree} from './loader';
import {getSharedRenderer} from './renderer';

/**
 * Largest surface texture edge in texels. Above this the content is
 * rasterized at a lower scale rather than clipped.
 */
const MAX_SURFACE_TEXELS = 4096;

/**
 * Built-in primitive shapes. Every primitive is authored at unit size and
 * scaled to {@link Mesh3D.size}, so tweening the size does not rebuild the
 * geometry. The exceptions are shapes whose proportions are part of the
 * shape: a `box` with a `radius` (its corners must stay spherical) and
 * `torus`, `torusKnot`, `capsule` and `ring` (their tube or inner diameter
 * is a ratio of the outer one). Those are rebuilt whenever a size tween
 * changes their aspect; scaling them uniformly is still free.
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
 * - `shadow`: invisible except for the shadows it receives — a shadow
 *   catcher. On a floor plane (`receiveShadow`) the background shows through
 *   and only the cast shadow remains. `opacity` sets the shadow strength;
 *   the shadow is black unless you pass a `color`. With the stage's
 *   `shadowType="vsm"` keep the catcher's `castShadow` on (the default):
 *   VSM blurs the receiver's own depth into the penumbra, and a catcher
 *   missing from the shadow map shows an eroded, hard-edged shadow. It is
 *   drawn before other transparent meshes, so cards and labels standing on
 *   it never punch holes into its shadow.
 * - `clay`: matte modelling clay — very rough, non-metallic, a little sheen
 *   and a soft rim that brightens toward the silhouette. Made for the
 *   `environment="studio"` + `toneMapping="neutral"` stage look, fine under
 *   plain lights. `metalness` / `roughness` keep the clay defaults (0 /
 *   0.88) until you set them. Rim and sheen are toned down on dark colours
 *   so a dark body does not get a grey halo.
 * - `glass`: an edge-glow bubble — a nearly clear body whose silhouette
 *   glows in `color`. Always transparent, does not write depth and draws
 *   after the other transparent meshes, so it composites over everything
 *   behind it. No refraction (cheap: one pass, no transmission). Reads best
 *   on curved shapes (spheres, capsules, rounded boxes): the glow is a
 *   fresnel term, so a flat face seen head-on gets none. Casts no shadow
 *   unless you set `castShadow` (a clear body would cast a solid one); it
 *   still receives shadows.
 */
export type Mesh3DMaterial =
  | 'standard'
  | 'physical'
  | 'phong'
  | 'lambert'
  | 'toon'
  | 'basic'
  | 'normal'
  | 'shadow'
  | 'clay'
  | 'glass';

export type Mesh3DSide = 'front' | 'back' | 'double';

/**
 * Size in pixels: a single number, `[width, height]` or
 * `[width, height, depth]`. Missing dimensions repeat the width.
 */
export type PossibleMesh3DSize =
  | number
  | [number, number]
  | [number, number, number];

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
   * {@inheritDoc Mesh3D.contentMaterial}
   */
  contentMaterial?: SignalValue<Mesh3DMaterial | null>;
  /**
   * {@inheritDoc Mesh3D.contentScale}
   */
  contentScale?: SignalValue<number | null>;
  /**
   * {@inheritDoc Mesh3D.castShadow}
   */
  castShadow?: SignalValue<boolean | null>;
  /**
   * {@inheritDoc Mesh3D.receiveShadow}
   */
  receiveShadow?: SignalValue<boolean>;
  /**
   * {@inheritDoc Mesh3D.reveal}
   */
  reveal?: SignalValue<number>;
  /**
   * {@inheritDoc Mesh3D.revealColor}
   */
  revealColor?: SignalValue<PossibleColor>;
}

interface TextureEntry {
  texture: THREE.Texture | null;
  promise: Promise<THREE.Texture | null>;
  ready: boolean;
}

const TEXTURE_CACHE = new Map<string, TextureEntry>();

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
   * Self-illumination colour (glows regardless of lights). Alpha multiplies
   * {@link emissiveIntensity}, so a tween from transparent fades the glow in.
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
   * renderer waits for it like it does for {@link Img}. A URL that fails to
   * load is reported once and the mesh renders without it.
   *
   * @remarks
   * While the mesh hosts 2D children the content replaces the image on the
   * front face of a `box` (the other faces keep it) and on the whole
   * surface of every other shape.
   */
  @initial(null)
  @signal()
  public declare readonly map: SimpleSignal<string | null, this>;

  /**
   * Shading of the surface content (the 2D children), when it should differ
   * from {@link material}. `'basic'` makes a screen that glows on its own
   * instead of being lit by the scene. `null` (the default) follows
   * {@link material} (`standard` for a `shadow` body).
   *
   * @remarks
   * Surface content is exempt from the stage's `toneMapping`. With
   * `contentMaterial="basic"` that makes text and UI show exactly their
   * authored colours on any stage look, which is the crispest choice for
   * labels, signs and screens. Lit content (the default) is still shaded by
   * the scene's lights and environment: under a tone-mapped stage its hues
   * stay true, but a strongly lit face can clip to white where the
   * tone-mapped body around it would roll off.
   */
  @initial(null)
  @signal()
  public declare readonly contentMaterial: SimpleSignal<
    Mesh3DMaterial | null,
    this
  >;

  /**
   * Texels per pixel used to rasterize the surface content. `null` (the
   * default) follows the resolution the enclosing {@link Three} renders at
   * (its on-screen scale, `quality` and `zoom`), so content stays crisp
   * under Camera zoom, viewport zoom and high-resolution exports. It does
   * not account for the mesh's own `scale` or a positive `z` bringing it
   * closer to the camera: set it explicitly (e.g. `2`) for a surface that
   * is magnified that way. Lower it for large surfaces far from the camera.
   */
  @initial(null)
  @signal()
  public declare readonly contentScale: SimpleSignal<number | null, this>;

  /**
   * Whether this mesh casts shadows (needs `shadows` on the {@link Three}
   * node and a shadow-casting light). `null` (the default) means on,
   * except for `material="glass"`: its shadow would be as solid as an opaque
   * body's, so glass casts none unless you set `true`. Off is honoured under
   * `shadowType="vsm"` too, where three.js would otherwise draw every
   * shadow receiver into the shadow map.
   */
  @initial(null)
  @signal()
  public declare readonly castShadow: SimpleSignal<boolean | null, this>;

  /**
   * Whether shadows fall onto this mesh.
   */
  @initial(true)
  @signal()
  public declare readonly receiveShadow: SimpleSignal<boolean, this>;

  /**
   * How much of the mesh is materialised, `0`–`1`: a noise dissolve for
   * entrances and exits. `1` (the default) is the untouched mesh, `0` hides
   * it; in between, blobs of surface are cut away and the cut edge glows in
   * {@link revealColor}.
   *
   * @remarks
   * Prefer it over `opacity` for 3D entrances: the mesh stays opaque, so it
   * keeps its depth sorting, lighting and shadows instead of turning into a
   * see-through shell. The noise is fixed to the shape (it does not swim
   * when the camera or the mesh moves) and is the same on every render. The
   * cast shadow dissolves with it. Applies to the built-in materials except
   * `shadow` (a custom `THREE.Material` ignores it); the surface content
   * dissolves with the body. Meshes of the same size dissolve in the same
   * pattern.
   */
  @initial(1)
  @signal()
  public declare readonly reveal: SimpleSignal<number, this>;

  /**
   * Colour of the glowing edge of a {@link reveal} dissolve. Until set it
   * follows {@link color}, except on near-white or near-black meshes (luma
   * above 0.85 or below 0.2), where an edge in the body colour would not
   * show: those fall back to amber (`#f59e0b`). Set it to match a palette;
   * on light pastels an explicit accent also reads better than the body
   * colour. Drawn after tone mapping, so it shows its authored colour (with
   * a hot, whiter core) on any stage look, no bloom needed.
   */
  @initial('#ffffff')
  @colorSignal()
  public declare readonly revealColor: ColorSignal<this>;

  private ownGeometry: THREE.BufferGeometry | null = null;
  private ownGeometryKey = '';
  private ownMaterial: THREE.Material | null = null;
  private ownMaterialKind: Mesh3DMaterial | null = null;
  private innerMesh: THREE.Mesh | null = null;
  private renderOrder = 0;
  private revealUniformValues: RevealUniforms | null = null;
  private revealDepth: THREE.MeshDepthMaterial | null = null;
  private revealDistance: THREE.MeshDistanceMaterial | null = null;
  private shadowSilenced = false;
  private surfaceMaterial: THREE.Material | null = null;
  private surfaceMaterialKind: Mesh3DMaterial | null = null;
  private surfaceCanvasElement: HTMLCanvasElement | null = null;
  private surfaceTexture: THREE.CanvasTexture | null = null;
  private surfaceTextureSize = new Vector2();
  private surfaceView: View2D | null = null;
  // Not `scene2D`: that is Node's own private field, and redeclaring it
  // makes Mesh3D unassignable to Node (not a valid JSX element).
  private readonly surfaceScene: Scene;

  public constructor(props?: Mesh3DProps) {
    super(props ?? {});
    this.surfaceScene = useScene();
  }

  protected override acceptsContent(): boolean {
    return true;
  }

  /**
   * Lets `yield mesh()` (and `yield stage()` on the {@link Three} node) wait
   * for {@link map} and for web fonts used by the surface content, which is
   * laid out in the surface's own view rather than the scene's.
   */
  protected override collectAsyncResources() {
    this.texture();
    for (const child of this.surfaceChildren()) {
      if (child instanceof Layout) {
        // Reading the size lays the content out, which registers a pending
        // font with the surface view.
        child.width();
      }
    }
    super.collectAsyncResources();
  }

  protected override createObject(three: ThreeModule): THREE.Object3D {
    // The node's object is a holder group; the mesh inside carries the
    // `size` scale, so 3D children attached to the holder are not scaled by
    // this mesh's dimensions.
    const holder = new three.Group();
    holder.name = 'Mesh3D';
    this.innerMesh = new three.Mesh();
    holder.add(this.innerMesh);
    return holder;
  }

  protected override updateObject() {
    const mesh = this.innerMesh!;
    mesh.geometry = this.resolvedGeometry();
    mesh.material = this.resolvedMaterials();
    const material = this.material();
    // A clear glass body would cast a fully opaque shadow: off until set.
    mesh.castShadow = this.castShadow() ?? material !== 'glass';
    mesh.receiveShadow = this.receiveShadow();
    // Under VSM three.js also draws receivers into the shadow map (it blurs
    // their depth into the penumbra), so a receiving mesh with castShadow
    // off would still cast. Its shadow pass then gets materials that write
    // nothing.
    const silenced = !mesh.castShadow && mesh.receiveShadow;
    if (silenced !== this.shadowSilenced) {
      if (silenced) {
        acquireNoShadowMaterials(getThree());
      } else {
        releaseNoShadowMaterials(getThree());
      }
      this.shadowSilenced = silenced;
    }
    // A shadow catcher is transparent and would be depth-sorted by its
    // centre against transparent surface content; draw it first so content
    // standing on it does not cut holes into its shadow. Glass goes last so
    // its clear body composites over everything else.
    const order = material === 'shadow' ? -1 : material === 'glass' ? 1 : 0;
    if (order !== this.renderOrder) {
      mesh.renderOrder = order;
      this.renderOrder = order;
    }

    // Size is applied as the inner mesh's scale, so primitives stay
    // unit-sized and tweening `size` does not rebuild their geometry (a
    // rounded box is the exception, see resolvedGeometry).
    const [sx, sy, sz] = this.geometryScale();
    mesh.scale.set(sx, sy, sz);
    this.updateReveal(mesh);
  }

  /**
   * The dissolve uniforms, shared by every material of this mesh (body,
   * surface content and the shadow pass).
   */
  private revealUniforms(): RevealUniforms {
    return (this.revealUniformValues ??= createRevealUniforms(getThree()));
  }

  /**
   * Drive the {@link reveal} dissolve: the shader variant of the built-in
   * materials, its uniforms and the shadow-pass materials.
   *
   * @remarks
   * The dissolve is only compiled in while `reveal < 1`, so a revealed mesh
   * renders with exactly the program it had before (no extra cost, no
   * change in output).
   */
  private updateReveal(mesh: THREE.Mesh) {
    const three = getThree();
    const reveal = Math.min(1, Math.max(0, this.reveal()));
    const material = this.material();
    const revealing =
      reveal < 1 && typeof material === 'string' && material !== 'shadow';
    // reveal = 0 hides the mesh outright (3D children stay).
    mesh.visible = !revealing || reveal > 0;
    for (const own of [this.ownMaterial, this.surfaceMaterial]) {
      if (own) {
        setShaderFlags(own, {reveal: revealing});
      }
    }
    // castShadow off wins over the dissolve's shadow pass.
    const silent = this.shadowSilenced
      ? acquireNoShadowMaterials(three, false)
      : null;
    if (!revealing || silent) {
      mesh.customDepthMaterial = silent?.depth;
      mesh.customDistanceMaterial = silent?.distance;
      if (!revealing) {
        return;
      }
    }

    const uniforms = this.revealUniforms();
    uniforms.uMcRevealT.value = revealThreshold(reveal);
    applyColor(
      three,
      uniforms.uMcRevealColor.value,
      this.revealColor.isInitial()
        ? defaultRevealColor(this.color())
        : this.revealColor(),
    );
    // Noise cells are isotropic in pixels and sized to the mesh: about
    // REVEAL_CELLS blobs across its largest dimension.
    const [w, h, d] = this.size3();
    let extent = Math.max(w, h, d);
    if (typeof this.geometry() !== 'string') {
      const geometry = mesh.geometry;
      if (!geometry.boundingSphere) {
        geometry.computeBoundingSphere();
      }
      extent = geometry.boundingSphere!.radius * 2;
    }
    uniforms.uMcRevealFreq.value
      .copy(mesh.scale)
      .multiplyScalar(REVEAL_CELLS / Math.max(extent, 1e-6));

    // The shadow pass draws with its own materials: give it ones that cut
    // the same holes, so the cast shadow dissolves with the mesh.
    if (!this.revealDepth) {
      this.revealDepth = new three.MeshDepthMaterial();
      installShader(this.revealDepth, {reveal: true}, uniforms);
      this.revealDistance = new three.MeshDistanceMaterial();
      installShader(this.revealDistance, {reveal: true}, uniforms);
    }
    if (!silent) {
      mesh.customDepthMaterial = this.revealDepth;
      mesh.customDistanceMaterial = this.revealDistance!;
    }
  }

  /**
   * The Three.js mesh itself (geometry, material, shadow flags).
   *
   * @remarks
   * {@link object3D} returns the holder group that carries the node's
   * transform and its 3D children; the mesh inside it carries the `size`
   * scale. Only valid once the runtime has loaded, like {@link object3D}.
   */
  public mesh(): THREE.Mesh {
    this.object3D();
    return this.innerMesh!;
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
    // A rounded box bakes all three proportions plus the corner radius, so a
    // size or radius tween rebuilds it every frame. That is a few thousand
    // vertices and one upload; acceptable, but not free like the others.
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
    if (geometry === 'box') {
      addSurfaceGroup(unit);
    }
    this.ownGeometry = applyOrigin(three, unit, origin);
    this.ownGeometryKey = key;
    return this.ownGeometry;
  }

  /**
   * The material(s) for the mesh: the body material, or, when 2D children
   * provide surface content, the content material on the front face of a
   * box and on the whole surface of any other shape.
   *
   * @remarks
   * On a box the front face is drawn twice: once with the body material
   * (group 4) and once more with the content on top (the extra group added
   * by {@link addSurfaceGroup}), so transparent areas of the content show
   * the lit body rather than the inside of the box.
   */
  @computed()
  private resolvedMaterials(): THREE.Material | THREE.Material[] {
    const body = this.resolvedMaterial();
    const surface = this.resolvedSurfaceMaterial();
    if (!surface) {
      return body;
    }
    if (this.geometry() === 'box') {
      return [body, body, body, body, body, body, surface];
    }
    return surface;
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
      if (material !== 'shadow') {
        installShader(
          this.ownMaterial,
          {
            look: material === 'clay' || material === 'glass' ? material : null,
          },
          this.revealUniforms(),
        );
      }
    }

    const mat = this.ownMaterial as THREE.MeshStandardMaterial;
    const color = this.color();
    const opacity = this.opacity3D() * color.alpha();
    if (material === 'shadow') {
      // The default white would make an invisible "shadow"; only an
      // explicit colour tints it.
      applyColor(
        three,
        mat.color,
        this.color.isInitial() ? new Color('#000000') : color,
      );
      mat.opacity = opacity;
      mat.side = sideConstant(three, this.side());
      // A shadow catcher always blends: as an opaque material it would
      // paint the whole plane black.
      setTransparent(mat, true);
      return mat;
    }
    if ('color' in mat) {
      applyColor(three, mat.color, color);
    }
    if ('emissive' in mat) {
      const glow = applyColor(three, mat.emissive, this.emissive());
      mat.emissiveIntensity = this.emissiveIntensity() * glow;
    }
    if ('metalness' in mat) {
      // The presets bring their own surface until these are set.
      const preset = MATERIAL_PRESETS[material];
      mat.metalness =
        preset && this.metalness.isInitial()
          ? preset.metalness
          : this.metalness();
      mat.roughness =
        preset && this.roughness.isInitial()
          ? preset.roughness
          : this.roughness();
    }
    if (material === 'clay') {
      // Sheen tinted from the body colour toward white: a soft, dusty
      // highlight at grazing angles rather than a coloured one. Halfway on
      // light colours, a quarter on dark ones, where a whiter sheen reads
      // as a grey halo.
      const t = clayWhiteMix(colorLuma(color));
      const {r, g, b} = mat.color;
      (mat as THREE.MeshPhysicalMaterial).sheenColor.setRGB(
        r + (1 - r) * t,
        g + (1 - g) * t,
        b + (1 - b) * t,
      );
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
    // Glass is see-through at any opacity (its body alpha comes from the
    // shader).
    setTransparent(mat, material === 'glass' || opacity < 1);
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
    let entry = TEXTURE_CACHE.get(url);
    if (!entry) {
      const loader = new three.TextureLoader();
      loader.setCrossOrigin('anonymous');
      const created: Partial<TextureEntry> = {ready: false};
      const logger = useLogger();
      // A failure resolves to `null` (the mesh renders without the image)
      // rather than rejecting: a rejection would surface as an unhandled
      // promise from every mesh that shares the URL. The failed entry stays
      // cached so the URL is not requested again on every re-evaluation.
      created.promise = new Promise<THREE.Texture | null>(resolve => {
        created.texture = loader.load(
          url,
          () => {
            created.ready = true;
            resolve(created.texture!);
          },
          undefined,
          () => {
            created.texture?.dispose();
            created.texture = null;
            created.ready = true;
            logger.error({
              message: `Mesh3D: failed to load texture "${url}".`,
              inspect: this.key,
            });
            resolve(null);
          },
        );
      });
      created.texture!.colorSpace = three.SRGBColorSpace;
      entry = created as TextureEntry;
      TEXTURE_CACHE.set(url, entry);
    }
    if (entry.ready) {
      return entry.texture;
    }
    return DependencyContext.collectPromise(entry.promise, null).value;
  }

  // ─── Surface content: 2D children rendered into a texture ────────────────

  /**
   * The 2D children that make up the surface content, in draw order.
   */
  @computed()
  protected surfaceChildren(): Node[] {
    return this.sortedChildren().filter(
      child => !(child instanceof Object3DNode),
    );
  }

  /**
   * Whether this mesh shows 2D children on its surface.
   */
  public hasSurface(): boolean {
    return this.surfaceChildren().length > 0;
  }

  /**
   * Size of the surface in pixels: the mesh's width and height. The surface
   * is the local space of the 2D children — `(0, 0)` is its centre, the
   * texture edge is at `±width / 2` and `±height / 2`.
   */
  @computed()
  public surfaceSize(): Vector2 {
    const [w, h] = this.size3();
    return new Vector2(Math.max(w, 1), Math.max(h, 1));
  }

  /**
   * Maps surface space (pixels, centred) to texture space (texels, origin at
   * the top-left corner). Also what {@link localToWorld} returns while the
   * mesh hosts content, so the children's world space is the texture. As a
   * consequence `absolutePosition()` of a content child is a texel position,
   * not a scene position; use {@link screenPosition} on the mesh to pin
   * scene-level nodes to it.
   */
  @computed()
  private surfaceMatrix(): DOMMatrix {
    const size = this.surfaceSize();
    let scale = this.contentScale();
    if (scale === null) {
      const root = this.findAncestor(isObject3DRoot);
      scale = root?.renderScale() ?? 1;
    }
    scale = Math.max(0.05, scale);
    const limit = MAX_SURFACE_TEXELS / Math.max(size.x, size.y);
    scale = Math.min(scale, limit);
    const width = Math.max(1, Math.round(size.x * scale));
    const height = Math.max(1, Math.round(size.y * scale));
    return new DOMMatrix([
      width / size.x,
      0,
      0,
      height / size.y,
      width / 2,
      height / 2,
    ]);
  }

  @computed()
  public override localToWorld(): DOMMatrix {
    return this.hasSurface() ? this.surfaceMatrix() : super.localToWorld();
  }

  protected override compositeRoot(): Node | null {
    return this.hasSurface() ? this : super.compositeRoot();
  }

  /**
   * While hosting content, the children see a view the size of the surface
   * instead of the scene view, so cached children (opacity, filters,
   * shadows) are clipped to the texture rather than to the scene bounds and
   * layout roots measure against the surface.
   */
  public override view(): View2D {
    if (!this.hasSurface()) {
      return super.view();
    }
    if (!this.surfaceView) {
      const real = super.view();
      // Node construction needs the scene context, which is not active
      // during rendering.
      startScene(this.surfaceScene);
      try {
        this.surfaceView = new View2D({
          assetHash: real.assetHash(),
          size: () => this.surfaceSize(),
          scale: () => {
            const m = this.surfaceMatrix();
            return new Vector2(m.a, m.d);
          },
          position: () => {
            const m = this.surfaceMatrix();
            return new Vector2(m.e, m.f);
          },
        });
        // Mirror the real view so videos, images and asset reloads inside
        // the content behave as they do on the scene canvas.
        this.surfaceView
          .assetHash(() => real.assetHash())
          .playbackState(() => real.playbackState())
          .globalTime(() => real.globalTime());
      } finally {
        endScene(this.surfaceScene);
      }
    }
    return this.surfaceView;
  }

  /**
   * The surface content rasterized into a canvas. Re-drawn only when a
   * signal it depends on changes (a child's props, the surface size or the
   * render scale); camera and mesh transforms do not touch it.
   */
  @computed()
  private surfaceCanvas(): HTMLCanvasElement | null {
    const children = this.surfaceChildren();
    if (children.length === 0) {
      return null;
    }
    const m = this.surfaceMatrix();
    const width = Math.round(m.e * 2);
    const height = Math.round(m.f * 2);
    const canvas = (this.surfaceCanvasElement ??=
      document.createElement('canvas'));
    const context = canvas.getContext('2d');
    if (!context) {
      throw new Error('Could not create a surface canvas');
    }
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    } else {
      context.resetTransform();
      context.clearRect(0, 0, width, height);
    }
    context.setTransform(m.a, m.b, m.c, m.d, m.e, m.f);
    for (const child of children) {
      child.render(context);
    }
    return canvas;
  }

  @computed()
  private resolvedSurfaceTexture(): THREE.CanvasTexture | null {
    const canvas = this.surfaceCanvas();
    if (!canvas) {
      this.disposeSurfaceTexture();
      return null;
    }
    const three = getThree();
    // The GPU storage of a texture is allocated once, at the size of its
    // first upload, so a canvas that changed size (mesh size tween, Camera
    // zoom, quality change) needs a fresh texture.
    if (
      this.surfaceTexture &&
      (this.surfaceTextureSize.x !== canvas.width ||
        this.surfaceTextureSize.y !== canvas.height)
    ) {
      this.disposeSurfaceTexture();
    }
    if (!this.surfaceTexture) {
      const texture = new three.CanvasTexture(canvas);
      if (canPremultiplySurface(three)) {
        // Uploaded premultiplied (the canvas already stores its pixels that
        // way) so mipmaps average the transparent margin correctly; the
        // shader un-premultiplies and decodes sRGB itself, see
        // surfaceMapChunk.
        texture.premultiplyAlpha = true;
        texture.colorSpace = three.NoColorSpace;
      } else {
        texture.colorSpace = three.SRGBColorSpace;
      }
      texture.anisotropy =
        getSharedRenderer(three).capabilities.getMaxAnisotropy();
      this.surfaceTexture = texture;
      this.surfaceTextureSize = new Vector2(canvas.width, canvas.height);
    }
    // Re-evaluated only when the canvas was re-drawn, so this is exactly one
    // upload per content change.
    this.surfaceTexture.needsUpdate = true;
    return this.surfaceTexture;
  }

  @computed()
  private resolvedSurfaceMaterial(): THREE.Material | null {
    const texture = this.resolvedSurfaceTexture();
    if (!texture) {
      this.disposeSurfaceMaterial();
      return null;
    }
    const three = getThree();
    const body = this.material();
    // Content on a `shadow` body is lit normally; on `glass` it stays
    // legible instead of fading into the clear body.
    let kind =
      this.contentMaterial() ?? (typeof body === 'string' ? body : 'standard');
    if (kind === 'shadow' || kind === 'glass') {
      kind = 'standard';
    }
    if (!this.surfaceMaterial || this.surfaceMaterialKind !== kind) {
      this.disposeSurfaceMaterial();
      this.surfaceMaterial = createMaterial(three, kind);
      // Text and UI on a surface keep their authored colours under a
      // stage's `toneMapping` (a no-op without one). Lighting still shades
      // them like the body.
      this.surfaceMaterial.toneMapped = false;
      installShader(
        this.surfaceMaterial,
        {
          surface: canPremultiplySurface(three),
          look: kind === 'clay' ? 'clay' : null,
        },
        this.revealUniforms(),
      );
      this.surfaceMaterialKind = kind;
    }
    const mat = this.surfaceMaterial as THREE.MeshStandardMaterial;
    const opacity = this.opacity3D();
    if ('color' in mat) {
      // White so the content keeps its own colours; `color` is the body.
      mat.color.set(0xffffff);
    }
    if ('metalness' in mat) {
      const preset = MATERIAL_PRESETS[kind];
      mat.metalness =
        preset && this.metalness.isInitial()
          ? preset.metalness
          : this.metalness();
      mat.roughness =
        preset && this.roughness.isInitial()
          ? preset.roughness
          : this.roughness();
    }
    if (kind === 'clay') {
      (mat as THREE.MeshPhysicalMaterial).sheenColor.set(0xffffff);
    }
    if ('map' in mat && mat.map !== texture) {
      mat.map = texture;
      mat.needsUpdate = true;
    }
    const side = this.side();
    mat.side =
      side === 'double'
        ? three.DoubleSide
        : side === 'back'
          ? three.BackSide
          : three.FrontSide;
    // Content may have transparent areas (a floating card, a label), so the
    // surface always blends.
    setTransparent(mat, true);
    mat.opacity = opacity;
    // On a box the surface is drawn over the body's front face at the same
    // depth; nudge it toward the camera so it wins the depth test cleanly.
    const onBox = this.geometry() === 'box';
    mat.polygonOffset = onBox;
    mat.polygonOffsetFactor = onBox ? -1 : 0;
    mat.polygonOffsetUnits = onBox ? -1 : 0;
    return mat;
  }

  private disposeSurfaceTexture() {
    this.surfaceTexture?.dispose();
    this.surfaceTexture = null;
  }

  private disposeSurfaceMaterial() {
    this.surfaceMaterial?.dispose();
    this.surfaceMaterial = null;
    this.surfaceMaterialKind = null;
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
    this.disposeSurfaceMaterial();
    this.disposeSurfaceTexture();
    this.revealDepth?.dispose();
    this.revealDepth = null;
    this.revealDistance?.dispose();
    this.revealDistance = null;
    if (this.shadowSilenced) {
      releaseNoShadowMaterials(getThree());
      this.shadowSilenced = false;
    }
    if (this.innerMesh) {
      this.innerMesh.customDepthMaterial = undefined;
      this.innerMesh.customDistanceMaterial = undefined;
    }
    this.innerMesh?.removeFromParent();
    this.innerMesh = null;
    this.surfaceCanvasElement = null;
    this.surfaceView?.dispose();
    this.surfaceView = null;
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
  // The subdivisions all end up in the rounded edges, so the box's uniform
  // UV grid would squeeze the whole flat face into one cell. Re-derive UVs
  // from the final positions so a texture (surface content) covers each
  // face edge to edge, with the rounded band as its outer margin.
  remapBoxUvs(geometry, width, height, depth);
  return geometry;
}

/**
 * Adds a seventh group to a box that covers the same triangles as the front
 * face (group 4, `+z`). With a material array the front face is then drawn
 * twice: the body first, the surface content on top.
 */
function addSurfaceGroup(geometry: THREE.BufferGeometry) {
  const front = geometry.groups[4];
  if (front) {
    geometry.addGroup(front.start, front.count, 6);
  }
}

/**
 * Rebuild the UVs of a (possibly deformed) box from its vertex positions,
 * face by face, following `BoxGeometry`'s own conventions per face:
 * `[uAxis, vAxis, uDir, vDir, uSize, vSize]`.
 */
function remapBoxUvs(
  geometry: THREE.BufferGeometry,
  width: number,
  height: number,
  depth: number,
) {
  const faces: [number, number, number, number, number, number][] = [
    [2, 1, -1, -1, depth, height], // +x
    [2, 1, 1, -1, depth, height], // -x
    [0, 2, 1, 1, width, depth], // +y
    [0, 2, 1, -1, width, depth], // -y
    [0, 1, 1, -1, width, height], // +z
    [0, 1, -1, -1, width, height], // -z
  ];
  const positions = geometry.attributes.position.array as Float32Array;
  const uvs = geometry.attributes.uv.array as Float32Array;
  for (const group of geometry.groups) {
    const face = faces[group.materialIndex ?? 0];
    if (!face) {
      continue;
    }
    const [ua, va, udir, vdir, usize, vsize] = face;
    for (let i = group.start; i < group.start + group.count; i++) {
      const pu = positions[i * 3 + ua] * udir;
      const pv = positions[i * 3 + va] * vdir;
      uvs[i * 2] = Math.min(1, Math.max(0, (pu + usize / 2) / usize));
      uvs[i * 2 + 1] = Math.min(1, Math.max(0, 1 - (pv + vsize / 2) / vsize));
    }
  }
  geometry.attributes.uv.needsUpdate = true;
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

function sideConstant(three: ThreeModule, side: Mesh3DSide): THREE.Side {
  return side === 'double'
    ? three.DoubleSide
    : side === 'back'
      ? three.BackSide
      : three.FrontSide;
}

function createMaterial(
  three: ThreeModule,
  kind: Mesh3DMaterial,
): THREE.Material {
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
    case 'shadow':
      return new three.ShadowMaterial();
    case 'clay':
      return new three.MeshPhysicalMaterial({
        sheen: 0.4,
        sheenRoughness: 0.8,
      });
    case 'glass':
      return new three.MeshStandardMaterial({
        transparent: true,
        // A clear shell must not hide what is behind or inside it.
        depthWrite: false,
      });
  }
}

/**
 * Surface defaults of the material presets, used while `metalness` /
 * `roughness` are left at their initial values.
 */
const MATERIAL_PRESETS: Partial<
  Record<Mesh3DMaterial, {metalness: number; roughness: number}>
> = {
  clay: {metalness: 0, roughness: 0.88},
  glass: {metalness: 0, roughness: 0.15},
};

/**
 * How far the `clay` sheen is tinted from the body colour toward white:
 * 0.25 for dark colours (luma below 0.2), easing to 0.5 for light ones
 * (luma 0.5 and above).
 *
 * @internal
 */
export function clayWhiteMix(luma: number): number {
  const x = Math.min(1, Math.max(0, (luma - 0.2) / 0.3));
  return 0.25 + 0.25 * x * x * (3 - 2 * x);
}

/** Edge colour of a dissolve on near-white and near-black meshes. */
const REVEAL_ACCENT = new Color('#f59e0b');

/**
 * The {@link Mesh3D.revealColor} used while it is not set: the body colour,
 * or {@link REVEAL_ACCENT} where an edge in the body colour would vanish
 * (near-white: no contrast with the white-hot core; near-black: no glow).
 *
 * @internal
 */
export function defaultRevealColor(color: Color): Color {
  const luma = colorLuma(color);
  return luma > 0.85 || luma < 0.2 ? REVEAL_ACCENT : color;
}

interface NoShadowMaterials {
  depth: THREE.MeshDepthMaterial;
  distance: THREE.MeshDistanceMaterial;
  users: number;
}

const NO_SHADOW_MATERIALS = new WeakMap<ThreeModule, NoShadowMaterials>();

/**
 * Shadow-pass materials that write nothing: every fragment is discarded, so
 * the mesh leaves no depth (PCF) and no moments (VSM) in the shadow map.
 * Colour and depth writes are off as well. One pair is shared by all meshes
 * of a Three.js module and disposed when the last user releases it.
 *
 * @param count - Whether to register a user (`false` only looks the pair up
 *   for a mesh that already holds it).
 *
 * @internal
 */
export function acquireNoShadowMaterials(
  three: ThreeModule,
  count = true,
): NoShadowMaterials {
  let entry = NO_SHADOW_MATERIALS.get(three);
  if (!entry) {
    const silence = (material: THREE.Material) => {
      material.colorWrite = false;
      material.depthWrite = false;
      material.onBeforeCompile = shader => {
        shader.fragmentShader = shader.fragmentShader.replace(
          'void main() {',
          'void main() {\n\tdiscard;',
        );
      };
      material.customProgramCacheKey = () => 'motion-canvas-no-shadow';
      return material;
    };
    entry = {
      depth: silence(new three.MeshDepthMaterial()) as THREE.MeshDepthMaterial,
      distance: silence(
        new three.MeshDistanceMaterial(),
      ) as THREE.MeshDistanceMaterial,
      users: 0,
    };
    NO_SHADOW_MATERIALS.set(three, entry);
  }
  if (count) {
    entry.users++;
  }
  return entry;
}

/** @internal */
export function releaseNoShadowMaterials(three: ThreeModule) {
  const entry = NO_SHADOW_MATERIALS.get(three);
  if (!entry || --entry.users > 0) {
    return;
  }
  entry.depth.dispose();
  entry.distance.dispose();
  NO_SHADOW_MATERIALS.delete(three);
}

const MAP_SAMPLE = 'vec4 sampledDiffuseColor = texture2D( map, vMapUv );';

/**
 * Whether this Three.js version has the `map_fragment` chunk that
 * {@link surfaceMapChunk} patches. If a future version renames
 * it, the surface falls back to a straight-alpha sRGB texture (correct
 * colours, slightly dark edges when minified) instead of breaking.
 */
function canPremultiplySurface(three: ThreeModule): boolean {
  return three.ShaderChunk.map_fragment.includes(MAP_SAMPLE);
}

// ─── Shader patches of the built-in materials ──────────────────────────────

/**
 * The shader variants a built-in material is patched with, through one
 * `onBeforeCompile` hook per material. Each combination has its own program
 * cache key ({@link shaderKey}), so variants never share a program.
 *
 * @internal
 */
export interface ShaderFlags {
  /** Read `map` as premultiplied sRGB texels (surface content). */
  surface: boolean;
  /** A preset look applied on top of the lit shading. */
  look: 'clay' | 'glass' | null;
  /** Compile in the {@link Mesh3D.reveal} dissolve (only while it is below 1). */
  reveal: boolean;
}

/**
 * Uniforms of the reveal dissolve. One set per mesh, shared by its body,
 * surface and shadow-pass materials, so updating a value needs no
 * recompile.
 *
 * @internal
 */
export interface RevealUniforms {
  /** Noise threshold: fragments with noise above it are cut away. */
  uMcRevealT: {value: number};
  /** Object-space position → noise space (mesh scale / blob size). */
  uMcRevealFreq: {value: THREE.Vector3};
  /** Linear colour of the glowing edge. */
  uMcRevealColor: {value: THREE.Color};
}

/**
 * Width of the glowing edge band, in noise units (the noise spans 0–1).
 *
 * @internal
 */
export const REVEAL_BAND = 0.12;

/**
 * Noise blobs across the largest dimension of a mesh.
 */
const REVEAL_CELLS = 3;

/**
 * Map `reveal` (0–1) to the noise threshold. At 1 the threshold clears the
 * whole noise range plus the band, so no edge is left; at 0 nothing passes.
 *
 * @internal
 */
export function revealThreshold(reveal: number): number {
  return reveal * (1 + REVEAL_BAND);
}

function createRevealUniforms(three: ThreeModule): RevealUniforms {
  return {
    uMcRevealT: {value: revealThreshold(1)},
    uMcRevealFreq: {value: new three.Vector3(1, 1, 1)},
    uMcRevealColor: {value: new three.Color(1, 1, 1)},
  };
}

const SHADER_FLAGS = new WeakMap<THREE.Material, ShaderFlags>();

/**
 * Program cache key of a flag combination.
 *
 * @internal
 */
export function shaderKey(flags: ShaderFlags): string {
  const parts = [
    flags.surface && 'surface',
    flags.look,
    flags.reveal && 'reveal',
  ].filter(Boolean);
  return `motion-canvas:${parts.join('+')}`;
}

/**
 * The flags a material was patched with, or `undefined` for a material
 * this module does not manage (a custom one, a shadow catcher).
 *
 * @internal
 */
export function getShaderFlags(
  material: THREE.Material,
): ShaderFlags | undefined {
  return SHADER_FLAGS.get(material);
}

/**
 * Patch a built-in material with the given variants.
 *
 * @remarks
 * The hook stays installed for the material's lifetime and always adds the
 * reveal uniforms, even while the dissolve is not compiled in: Three keeps
 * the uniform set of the most recently built program, and switching back to
 * a cached variant must still find every uniform it reads.
 */
function installShader(
  material: THREE.Material,
  flags: Partial<ShaderFlags>,
  uniforms: RevealUniforms,
) {
  const three = getThree();
  SHADER_FLAGS.set(material, {
    surface: false,
    look: null,
    reveal: false,
    ...flags,
  });
  material.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, uniforms);
    patchShader(three, shader, SHADER_FLAGS.get(material)!);
  };
  material.customProgramCacheKey = () => shaderKey(SHADER_FLAGS.get(material)!);
  material.needsUpdate = true;
}

/**
 * Change some variants of a patched material; recompiles (or switches to
 * the cached program) only when the combination changed.
 */
function setShaderFlags(material: THREE.Material, flags: Partial<ShaderFlags>) {
  const current = SHADER_FLAGS.get(material);
  if (!current) {
    return;
  }
  const next = {...current, ...flags};
  if (shaderKey(next) !== shaderKey(current)) {
    SHADER_FLAGS.set(material, next);
    material.needsUpdate = true;
  }
}

const MAIN = 'void main() {';
const PROJECT_VERTEX = '#include <project_vertex>';
const CLIPPING_FRAGMENT = '#include <clipping_planes_fragment>';
const OPAQUE_FRAGMENT = '#include <opaque_fragment>';
const TONEMAPPING_FRAGMENT = '#include <tonemapping_fragment>';

/**
 * View direction for the fresnel looks (lit materials only: they declare
 * `vViewPosition` and the view-space `normal`).
 */
const VIEW_DIR = `vec3 mcViewDir = isOrthographic ? vec3( 0.0, 0.0, 1.0 ) : normalize( vViewPosition );`;

const CLAY_CHUNK = `
	// Clay: a soft rim that brightens toward the silhouette, tinted toward
	// white, as if light scattered just under a matte surface. Scaled down on
	// dark bodies (linear luma), where it would read as a grey halo.
	{
		${VIEW_DIR}
		float mcRim = pow( clamp( 1.0 - dot( normal, mcViewDir ), 0.0, 1.0 ), 3.0 );
		float mcLuma = dot( diffuseColor.rgb, vec3( 0.2126, 0.7152, 0.0722 ) );
		mcRim *= mix( 0.35, 1.0, smoothstep( 0.05, 0.5, mcLuma ) );
		outgoingLight += mix( diffuseColor.rgb, vec3( 1.0 ), 0.6 ) * mcRim * 0.2;
	}
`;

const GLASS_CHUNK = `
	// Glass: a nearly clear body whose silhouette glows in the base colour.
	// mcEdge is a fresnel term, 0 facing the camera and 1 at grazing angles;
	// specular highlights also stay visible on the clear body.
	{
		${VIEW_DIR}
		float mcEdge = pow( clamp( 1.0 - abs( dot( normal, mcViewDir ) ), 0.0, 1.0 ), 2.5 );
		float mcGlint = clamp( dot( totalSpecular, vec3( 0.3333 ) ), 0.0, 1.0 );
		outgoingLight += diffuseColor.rgb * mcEdge * 1.5;
		diffuseColor.a *= mix( 0.12, 1.0, max( mcEdge, mcGlint ) );
	}
`;

const REVEAL_VERTEX_PARS = `
uniform vec3 uMcRevealFreq;
varying vec3 vMcRevealPos;
`;

// Object space (after morphs / skinning), so the pattern sticks to the
// shape when the camera or the mesh moves.
const REVEAL_VERTEX = `
	vMcRevealPos = transformed * uMcRevealFreq;
`;

const REVEAL_FRAGMENT_PARS = `
#define MC_REVEAL_BAND ${REVEAL_BAND.toFixed(3)}
uniform float uMcRevealT;
uniform vec3 uMcRevealColor;
varying vec3 vMcRevealPos;
// Value noise over a sine-free hash (iq), deterministic across GPUs.
float mcHash( vec3 p ) {
	p = fract( p * 0.3183099 + 0.1 );
	p *= 17.0;
	return fract( p.x * p.y * p.z * ( p.x + p.y + p.z ) );
}
float mcNoise( vec3 x ) {
	vec3 i = floor( x );
	vec3 f = fract( x );
	f = f * f * ( 3.0 - 2.0 * f );
	return mix(
		mix( mix( mcHash( i ), mcHash( i + vec3( 1.0, 0.0, 0.0 ) ), f.x ),
			mix( mcHash( i + vec3( 0.0, 1.0, 0.0 ) ), mcHash( i + vec3( 1.0, 1.0, 0.0 ) ), f.x ), f.y ),
		mix( mix( mcHash( i + vec3( 0.0, 0.0, 1.0 ) ), mcHash( i + vec3( 1.0, 0.0, 1.0 ) ), f.x ),
			mix( mcHash( i + vec3( 0.0, 1.0, 1.0 ) ), mcHash( i + vec3( 1.0, 1.0, 1.0 ) ), f.x ), f.y ),
		f.z );
}
// Two octaves, flattened through an approximate CDF of their sum
// (measured) so the revealed share of the surface tracks reveal linearly.
float mcRevealNoise( vec3 p ) {
	float n = 0.65 * mcNoise( p ) + 0.35 * mcNoise( p * 2.13 + vec3( 11.7, 3.1, 7.9 ) );
	return smoothstep( 0.08, 0.85, n );
}
`;

const REVEAL_DISCARD = `
	// Reveal dissolve: cut away where the noise is above the threshold; the
	// last MC_REVEAL_BAND of surface before the cut is the glowing edge:
	// solid for its inner half, fading out over the outer half.
	float mcRevealD = uMcRevealT - mcRevealNoise( vMcRevealPos );
	if ( mcRevealD < 0.0 ) discard;
	float mcRevealEdge = 1.0 - smoothstep( 0.5 * MC_REVEAL_BAND, MC_REVEAL_BAND, mcRevealD );
	float mcRevealCore = 1.0 - smoothstep( 0.0, 0.35 * MC_REVEAL_BAND, mcRevealD );
`;

const REVEAL_GLOW = `
	// Painted after tone mapping so the edge keeps its authored colour on any
	// stage look; the core runs hot toward white so it reads as a glow
	// without bloom. Opaque, so it also shows on a glass body.
	{
		vec3 mcGlow = mix( uMcRevealColor, vec3( 1.0 ), 0.6 * mcRevealCore );
		gl_FragColor = mix( gl_FragColor, vec4( mcGlow, 1.0 ), mcRevealEdge );
	}
`;

/**
 * The `map_fragment` chunk reading premultiplied, sRGB-encoded texels: the
 * surface texture is uploaded that way so that mipmaps of the transparent
 * margin average correctly (straight-alpha mipmaps blend transparent black
 * into every edge, which shows as a dark rim once the surface is
 * minified). The sampled colour is un-premultiplied and decoded to linear
 * here, where Three's own chunk expects a straight sRGB sample; lighting
 * and blending are unchanged.
 */
function surfaceMapChunk(three: ThreeModule): string {
  return three.ShaderChunk.map_fragment.replace(
    MAP_SAMPLE,
    MAP_SAMPLE +
      `
	sampledDiffuseColor.rgb /= max( sampledDiffuseColor.a, 1e-4 );
	{
		vec3 c = sampledDiffuseColor.rgb;
		sampledDiffuseColor.rgb = mix(
			pow( c * 0.9478672986 + vec3( 0.0521327014 ), vec3( 2.4 ) ),
			c * 0.0773993808,
			vec3( lessThanEqual( c, vec3( 0.04045 ) ) )
		);
	}`,
  );
}

/**
 * Apply the variants to a shader about to compile. A chunk whose anchor is
 * missing (a material without it, or a future Three.js) is skipped rather
 * than producing a broken program.
 *
 * @internal
 */
export function patchShader(
  three: ThreeModule,
  shader: {vertexShader: string; fragmentShader: string},
  flags: ShaderFlags,
) {
  let vertex = shader.vertexShader;
  let fragment = shader.fragmentShader;
  if (flags.surface) {
    fragment = fragment.replace(
      '#include <map_fragment>',
      surfaceMapChunk(three),
    );
  }
  if (
    flags.look &&
    fragment.includes(OPAQUE_FRAGMENT) &&
    fragment.includes('vViewPosition')
  ) {
    fragment = fragment.replace(
      OPAQUE_FRAGMENT,
      (flags.look === 'clay' ? CLAY_CHUNK : GLASS_CHUNK) + OPAQUE_FRAGMENT,
    );
  }
  if (
    flags.reveal &&
    vertex.includes(PROJECT_VERTEX) &&
    fragment.includes(CLIPPING_FRAGMENT)
  ) {
    vertex = vertex
      .replace(MAIN, REVEAL_VERTEX_PARS + MAIN)
      .replace(PROJECT_VERTEX, REVEAL_VERTEX + PROJECT_VERTEX);
    fragment = fragment
      .replace(MAIN, REVEAL_FRAGMENT_PARS + MAIN)
      .replace(CLIPPING_FRAGMENT, CLIPPING_FRAGMENT + REVEAL_DISCARD);
    // Depth / distance (shadow pass) and normal materials have no tone
    // mapping step: they only cut.
    if (fragment.includes(TONEMAPPING_FRAGMENT)) {
      fragment = fragment.replace(
        TONEMAPPING_FRAGMENT,
        TONEMAPPING_FRAGMENT + REVEAL_GLOW,
      );
    }
  }
  shader.vertexShader = vertex;
  shader.fragmentShader = fragment;
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
