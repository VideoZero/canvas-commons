import {
  Rect,
  RectProps,
  computed,
  initial,
  interpolation,
  nodeName,
  parser,
  signal,
} from '@motion-canvas/2d';
import {
  Color,
  DependencyContext,
  PossibleColor,
  SignalValue,
  SimpleSignal,
  Vector2,
  useLogger,
} from '@motion-canvas/core';
import type * as THREE from 'three';
import {Light3D} from './Light3D';
import {Object3DRoot, syncObjectChildren} from './Object3DNode';
import {ThreeModule, getThree, isThreeLoaded, loadThree} from './loader';
import {getSharedRenderer} from './renderer';
import {PIXELS_PER_UNIT, PossibleVector3, toRadians} from './units';

export interface ThreeRenderCallback {
  (renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera): void;
}

export interface ThreeUpdateCallback {
  (scene: THREE.Scene, camera: THREE.Camera, three: ThreeModule): void;
}

export interface ThreeProps extends RectProps {
  /**
   * {@inheritDoc Three.scene}
   */
  scene?: SignalValue<THREE.Scene | null>;
  /**
   * {@inheritDoc Three.camera}
   */
  camera?: SignalValue<THREE.Camera | null>;
  /**
   * Called (with signal tracking) whenever the scene is synced. Read signals
   * inside it to drive hand-built Three.js objects deterministically:
   * ```tsx
   * const spin = createSignal(0);
   * <Three scene={scene} camera={camera}
   *        onUpdate={() => { knot.rotation.y = toRadians(spin()); }} />
   * yield* spin(360, 4);
   * ```
   * It re-runs only when a signal it read changes, so it is cheap and stays
   * correct when seeking or exporting. Do not read clocks or keep state.
   */
  onUpdate?: ThreeUpdateCallback;
  /**
   * {@inheritDoc Three.background}
   */
  background?: SignalValue<PossibleColor | null>;
  /**
   * {@inheritDoc Three.fog}
   */
  fog?: SignalValue<PossibleColor | null>;
  /**
   * {@inheritDoc Three.fogNear}
   */
  fogNear?: SignalValue<number | null>;
  /**
   * {@inheritDoc Three.fogFar}
   */
  fogFar?: SignalValue<number | null>;
  /**
   * {@inheritDoc Three.quality}
   */
  quality?: SignalValue<number>;
  /**
   * {@inheritDoc Three.shadows}
   */
  shadows?: SignalValue<boolean>;
  /**
   * {@inheritDoc Three.defaultLights}
   */
  defaultLights?: SignalValue<boolean>;
  /**
   * {@inheritDoc Three.cameraDistance}
   */
  cameraDistance?: SignalValue<number>;
  /**
   * {@inheritDoc Three.cameraYaw}
   */
  cameraYaw?: SignalValue<number>;
  /**
   * {@inheritDoc Three.cameraPitch}
   */
  cameraPitch?: SignalValue<number>;
  /**
   * {@inheritDoc Three.cameraTarget}
   */
  cameraTarget?: SignalValue<PossibleVector3>;
  /**
   * {@inheritDoc Three.fov}
   */
  fov?: SignalValue<number | null>;
  /**
   * {@inheritDoc Three.orthographic}
   */
  orthographic?: SignalValue<boolean>;
  /**
   * {@inheritDoc Three.zoom}
   */
  zoom?: SignalValue<number>;
  /**
   * Replace the default `renderer.render(scene, camera)` call, e.g. to run a
   * post-processing composer.
   */
  onRender?: ThreeRenderCallback;
}

/**
 * A 3D viewport rendered with Three.js, embedded in the 2D scene.
 *
 * @remarks
 * `Three` is a {@link Rect}: give it a size, and optionally `fill`, `radius`,
 * `stroke`, `shadow` or `clip` like any other rectangle. Its 3D children
 * ({@link Mesh3D}, {@link Group3D}, {@link Light3D}) are rendered through a
 * camera; its 2D children are drawn on top, so labels and callouts stay crisp
 * 2D text. Use {@link projectPoint} or a node's `screenPosition()` to pin 2D
 * annotations to 3D points.
 *
 * Coordinates are pixels, y down, z toward the camera — see
 * {@link PIXELS_PER_UNIT}. With the default camera a 3D object at `z={0}`
 * measures the same on screen as a 2D node of the same size, so a
 * `<Mesh3D geometry="box" size={200} />` next to a `<Rect size={200} />`
 * line up.
 *
 * The camera orbits {@link cameraTarget} at {@link cameraDistance}, turned by
 * {@link cameraYaw} / {@link cameraPitch}. All of them tween.
 *
 * The Three.js runtime is loaded on first use; rendering waits for it like it
 * waits for images.
 *
 * **Raw mode.** Pass your own `scene` and/or `camera` built with plain
 * Three.js to skip the node layer entirely — the node then only sizes the
 * camera, renders and blits. Both modes mix: 3D children are still added to
 * the supplied scene (inside the pixel-scaled {@link rootGroup}), and
 * {@link projectObject} works for any object. Use {@link ThreeProps.onUpdate}
 * to drive raw objects from signals. A raw scene that contains any light
 * gets no default rig, so light it fully yourself (the default rig is a
 * hemisphere light at 1.1 plus directionals at 2.2 and 0.6).
 *
 * {@link sceneObject}, {@link cameraObject}, {@link rootGroup} and a node's
 * `object3D()` are only available once the runtime has loaded — inside
 * `onUpdate`, `onRender`, an `Object3D` `update` callback, or a signal
 * function evaluated during rendering. Calling them at scene setup throws.
 *
 * @example
 * ```tsx
 * import {Three, Mesh3D} from '@motion-canvas/three';
 *
 * const stage = createRef<Three>();
 * const cube = createRef<Mesh3D>();
 * view.add(
 *   <Three ref={stage} width={960} height={540} fill="#0f172a" radius={24}
 *          cameraPitch={20} cameraYaw={-25}>
 *     <Mesh3D ref={cube} geometry="box" size={220} color="#38bdf8" />
 *   </Three>,
 * );
 * yield* all(cube().rotationY(180, 2), stage().cameraYaw(25, 2));
 * ```
 */
@nodeName('Three')
export class Three extends Rect implements Object3DRoot {
  /**
   * A hand-built `THREE.Scene` to render instead of the node's own.
   *
   * @remarks
   * Objects you add to it use plain Three.js conventions (units, radians,
   * y up). 3D child nodes are still rendered: they live in
   * {@link rootGroup}, which is attached to this scene. Default lights are
   * only added when the scene contains no light of its own.
   */
  @initial(null)
  @signal()
  public declare readonly scene: SimpleSignal<THREE.Scene | null, this>;

  /**
   * A hand-built `THREE.Camera` to render with instead of the orbit camera.
   *
   * @remarks
   * The camera is used where you put it; the orbit props (`cameraYaw`,
   * `cameraPitch`, `cameraDistance`, `cameraTarget`, `fov`, `orthographic`)
   * are ignored. The node keeps the projection in step with its size: the
   * aspect ratio of a perspective camera, the horizontal extent of an
   * orthographic one (its vertical extent is yours). {@link zoom} still
   * applies via `camera.zoom`.
   */
  @initial(null)
  @signal()
  public declare readonly camera: SimpleSignal<THREE.Camera | null, this>;

  /**
   * Opaque background colour of the 3D image, or `null` (default) for a
   * transparent image over the node's `fill`.
   *
   * @remarks
   * `fill` already gives you a backdrop with `radius` and alpha; set
   * `background` when the scene itself should be opaque, e.g. so
   * {@link fog} has something to fade into at the far plane.
   */
  @initial(null)
  @parser(nullableColor)
  @interpolation(Color.lerp)
  @signal()
  public declare readonly background: SimpleSignal<
    PossibleColor | null,
    this
  >;

  /**
   * Fog colour, or `null` (default) for no fog. Objects fade into this colour
   * between {@link fogNear} and {@link fogFar}. Use the same colour as
   * {@link background} (or `fill`) so distant objects dissolve into it.
   */
  @initial(null)
  @parser(nullableColor)
  @interpolation(Color.lerp)
  @signal()
  public declare readonly fog: SimpleSignal<PossibleColor | null, this>;

  /**
   * Distance from the camera in pixels where fog starts; `null` (default)
   * means {@link cameraDistance}, i.e. the target plane.
   */
  @initial(null)
  @signal()
  public declare readonly fogNear: SimpleSignal<number | null, this>;

  /**
   * Distance from the camera in pixels where fog is total; `null` (default)
   * means three times {@link cameraDistance}.
   */
  @initial(null)
  @signal()
  public declare readonly fogFar: SimpleSignal<number | null, this>;

  /**
   * Supersampling factor. `2` renders at twice the on-screen resolution for
   * smoother edges at a higher cost.
   */
  @initial(1)
  @signal()
  public declare readonly quality: SimpleSignal<number, this>;

  /**
   * Enable shadow maps. Lights also need `castShadow`.
   */
  @initial(false)
  @signal()
  public declare readonly shadows: SimpleSignal<boolean, this>;

  /**
   * When the scene has no {@link Light3D}, add a neutral three-point rig so
   * lit materials are visible. Turn off for fully unlit or custom setups.
   */
  @initial(true)
  @signal()
  public declare readonly defaultLights: SimpleSignal<boolean, this>;

  /**
   * Distance in pixels from the camera to {@link cameraTarget}.
   *
   * @remarks
   * Also sets the perspective strength: with {@link fov} unset the field of
   * view is derived so the target plane spans exactly the node's height, so a
   * smaller distance means stronger perspective at the same framing.
   */
  @initial(1600)
  @signal()
  public declare readonly cameraDistance: SimpleSignal<number, this>;

  /**
   * Orbit angle around the vertical axis in degrees. Positive moves the
   * camera to the right, showing the object's right side.
   */
  @initial(0)
  @signal()
  public declare readonly cameraYaw: SimpleSignal<number, this>;

  /**
   * Orbit elevation in degrees. Positive raises the camera above the target,
   * looking down.
   */
  @initial(0)
  @signal()
  public declare readonly cameraPitch: SimpleSignal<number, this>;

  /**
   * The point (in pixels) the camera orbits and looks at.
   */
  @initial([0, 0, 0])
  @signal()
  public declare readonly cameraTarget: SimpleSignal<PossibleVector3, this>;

  /**
   * Vertical field of view in degrees, or `null` to derive it from
   * {@link cameraDistance} so the target plane fills the node.
   */
  @initial(null)
  @signal()
  public declare readonly fov: SimpleSignal<number | null, this>;

  /**
   * Use an orthographic camera (no perspective) — isometric and technical
   * looks. The target plane still maps 1:1 to pixels.
   */
  @initial(false)
  @signal()
  public declare readonly orthographic: SimpleSignal<boolean, this>;

  /**
   * Camera zoom multiplier; `2` shows half the area at twice the size.
   */
  @initial(1)
  @signal()
  public declare readonly zoom: SimpleSignal<number, this>;

  public readonly onRender: ThreeRenderCallback | null;
  public readonly onUpdate: ThreeUpdateCallback | null;

  private ownScene: THREE.Scene | null = null;
  private ownFog: THREE.Fog | null = null;
  private ownBackground: THREE.Color | null = null;
  private warnedCamera = false;
  private lastShadows: boolean | null = null;
  private root: THREE.Group | null = null;
  private rig: THREE.Group | null = null;
  private perspective: THREE.PerspectiveCamera | null = null;
  private ortho: THREE.OrthographicCamera | null = null;

  public constructor(props?: ThreeProps) {
    const {onRender, onUpdate, ...rest} = props ?? {};
    super(rest);
    this.onRender = onRender ?? null;
    this.onUpdate = onUpdate ?? null;
  }

  /**
   * The Three.js runtime, or `null` while it is still loading.
   *
   * @remarks
   * The pending load is registered with the renderer, so exports wait for it.
   */
  @computed()
  public three(): ThreeModule | null {
    if (isThreeLoaded()) {
      return getThree();
    }
    return DependencyContext.collectPromise(loadThree(), null).value;
  }

  /**
   * The Three.js scene (the supplied {@link scene} or the node's own), synced
   * to the current signal values and with world matrices up to date. Add your
   * own objects to {@link rootGroup} rather than to the scene directly if you
   * want them in pixel units.
   */
  @computed()
  public sceneObject(): THREE.Scene {
    const three = getThree();
    if (!this.root) {
      this.root = new three.Group();
      this.root.name = 'motion-canvas-root';
      this.root.scale.setScalar(1 / PIXELS_PER_UNIT);
    }
    const scene = this.scene() ?? (this.ownScene ??= new three.Scene());
    if (this.root.parent !== scene) {
      scene.add(this.root);
    }

    syncObjectChildren(this, this.root);
    this.syncDefaultLights(three, scene, this.root);
    this.syncEnvironment(three, scene);
    const camera = this.cameraObject();
    this.onUpdate?.(scene, camera, three);
    scene.updateMatrixWorld(true);
    // A camera moved inside onUpdate must project correctly right away.
    camera.updateMatrixWorld(true);
    return scene;
  }

  private syncEnvironment(three: ThreeModule, scene: THREE.Scene) {
    const background = this.background();
    if (background) {
      this.ownBackground ??= new three.Color();
      this.ownBackground.set(new Color(background).hex());
      scene.background = this.ownBackground;
    } else if (scene.background === this.ownBackground) {
      scene.background = null;
    }

    const fog = this.fog();
    if (fog) {
      const distance = Math.max(1, this.cameraDistance());
      const near = (this.fogNear() ?? distance) / PIXELS_PER_UNIT;
      const far = (this.fogFar() ?? distance * 3) / PIXELS_PER_UNIT;
      this.ownFog ??= new three.Fog(0x000000, near, far);
      this.ownFog.color.set(new Color(fog).hex());
      this.ownFog.near = near;
      this.ownFog.far = Math.max(near + 1e-3, far);
      scene.fog = this.ownFog;
    } else if (scene.fog === this.ownFog) {
      scene.fog = null;
    }
  }

  /**
   * The group (scaled to pixel units) that holds every 3D child.
   */
  public rootGroup(): THREE.Group {
    this.sceneObject();
    return this.root!;
  }

  /**
   * The active camera, positioned and projecting for the current signals.
   */
  @computed()
  public cameraObject(): THREE.Camera {
    const three = getThree();
    const size = this.computedSize();
    const width = Math.max(1, size.width);
    const height = Math.max(1, size.height);
    const distance = Math.max(1, this.cameraDistance());
    const zoom = Math.max(1e-3, this.zoom());

    const custom = this.camera();
    if (custom) {
      this.warnIgnoredOrbit();
      if (isPerspective(custom)) {
        custom.aspect = width / height;
        custom.zoom = zoom;
        custom.updateProjectionMatrix();
      } else if (isOrthographic(custom)) {
        const halfH = (custom.top - custom.bottom) / 2;
        const centerX = (custom.left + custom.right) / 2;
        custom.left = centerX - (halfH * width) / height;
        custom.right = centerX + (halfH * width) / height;
        custom.zoom = zoom;
        custom.updateProjectionMatrix();
      }
      custom.updateMatrixWorld(true);
      return custom;
    }

    const yaw = toRadians(this.cameraYaw());
    const pitch = toRadians(this.cameraPitch());
    const [tx, ty, tz] = this.cameraTarget();
    const target = new three.Vector3(
      tx / PIXELS_PER_UNIT,
      -ty / PIXELS_PER_UNIT,
      tz / PIXELS_PER_UNIT,
    );
    const direction = new three.Vector3(
      Math.sin(yaw) * Math.cos(pitch),
      Math.sin(pitch),
      Math.cos(yaw) * Math.cos(pitch),
    );
    const units = distance / PIXELS_PER_UNIT;
    const near = Math.max(0.01, units / 200);
    const far = units * 100 + 100;

    let camera: THREE.Camera;
    if (this.orthographic()) {
      const halfW = width / 2 / PIXELS_PER_UNIT;
      const halfH = height / 2 / PIXELS_PER_UNIT;
      const cam = (this.ortho ??= new three.OrthographicCamera());
      cam.left = -halfW;
      cam.right = halfW;
      cam.top = halfH;
      cam.bottom = -halfH;
      cam.near = near;
      cam.far = far;
      cam.zoom = zoom;
      cam.updateProjectionMatrix();
      camera = cam;
    } else {
      const cam = (this.perspective ??= new three.PerspectiveCamera());
      const fov = this.fov();
      cam.fov =
        fov ?? (2 * Math.atan(height / 2 / distance) * 180) / Math.PI;
      cam.aspect = width / height;
      cam.near = near;
      cam.far = far;
      cam.zoom = zoom;
      cam.updateProjectionMatrix();
      camera = cam;
    }

    camera.position.copy(target).addScaledVector(direction, units);
    camera.up.set(0, 1, 0);
    camera.lookAt(target);
    camera.updateMatrixWorld(true);
    return camera;
  }

  /**
   * Project a 3D point (pixels, y down, z toward the camera — the same space
   * as 3D child nodes) to this node's local 2D space, e.g. to pin a label to
   * the top of a bar: `stage.projectPoint([x, top, 0])`.
   *
   * @remarks
   * For hand-built objects in a raw {@link scene} use {@link projectObject}
   * or {@link projectWorld} (Three.js world units).
   */
  public projectPoint(point: PossibleVector3): Vector2 {
    if (!this.three()) {
      return Vector2.zero;
    }
    const three = getThree();
    const [x, y, z] = point;
    const v = new three.Vector3(
      x / PIXELS_PER_UNIT,
      -y / PIXELS_PER_UNIT,
      z / PIXELS_PER_UNIT,
    );
    return this.projectWorld(v);
  }

  /**
   * Project the origin of a Three.js object to this node's local 2D space.
   */
  public projectObject(object: THREE.Object3D): Vector2 {
    if (!this.three()) {
      return Vector2.zero;
    }
    const three = getThree();
    this.sceneObject();
    const v = new three.Vector3();
    object.getWorldPosition(v);
    return this.projectWorld(v);
  }

  /**
   * Project a point given in Three.js world units (the space of a raw
   * {@link scene}: metres, y up) to this node's local 2D space. The vector is
   * modified in place.
   */
  public projectWorld(v: THREE.Vector3): Vector2 {
    if (!this.three()) {
      return Vector2.zero;
    }
    // Runs onUpdate first so a camera moved there projects correctly.
    this.sceneObject();
    const camera = this.cameraObject();
    const size = this.computedSize();
    v.project(camera);
    return new Vector2((v.x * size.width) / 2, (-v.y * size.height) / 2);
  }

  private warnIgnoredOrbit() {
    if (this.warnedCamera) {
      return;
    }
    const [tx, ty, tz] = this.cameraTarget();
    const touched =
      this.cameraYaw() !== 0 ||
      this.cameraPitch() !== 0 ||
      this.cameraDistance() !== 1600 ||
      tx !== 0 ||
      ty !== 0 ||
      tz !== 0 ||
      this.fov() !== null ||
      this.orthographic();
    if (touched) {
      this.warnedCamera = true;
      useLogger().warn({
        message:
          'Three: orbit camera props are ignored when a custom `camera` is set.',
        remarks:
          'cameraYaw, cameraPitch, cameraDistance, cameraTarget, fov and orthographic only drive the built-in camera. Move the supplied camera yourself (e.g. in onUpdate); zoom still applies.',
        inspect: this.key,
      });
    }
  }

  private syncDefaultLights(
    three: ThreeModule,
    scene: THREE.Scene,
    root: THREE.Group,
  ) {
    const wanted =
      this.defaultLights() &&
      this.findAll(node => node instanceof Light3D).length === 0 &&
      !hasLight(scene, this.rig);
    if (wanted && !this.rig) {
      const rig = new three.Group();
      rig.name = 'default-lights';
      const sky = new three.HemisphereLight(0xffffff, 0x334155, 1.1);
      const key = new three.DirectionalLight(0xffffff, 2.2);
      key.position.set(-600, 900, 1200);
      const fill = new three.DirectionalLight(0xffffff, 0.6);
      fill.position.set(900, -200, 600);
      rig.add(sky, key, fill);
      this.rig = rig;
    }
    if (this.rig) {
      if (wanted && this.rig.parent !== root) {
        root.add(this.rig);
      } else if (!wanted && this.rig.parent) {
        this.rig.removeFromParent();
      }
    }
  }

  protected override draw(context: CanvasRenderingContext2D) {
    this.drawShape(context);

    const three = this.three();
    const size = this.computedSize();
    if (three && size.width > 0 && size.height > 0) {
      const scene = this.sceneObject();
      const camera = this.cameraObject();

      // Render at the on-screen resolution (accounts for Camera zoom and
      // cached rasterization) times the requested supersampling.
      const m = context.getTransform();
      const onScreen =
        Math.max(Math.hypot(m.a, m.b), Math.hypot(m.c, m.d)) || 1;
      const q = Math.max(0.05, this.quality() * onScreen);
      const w = Math.min(4096, Math.max(1, Math.round(size.width * q)));
      const h = Math.min(4096, Math.max(1, Math.round(size.height * q)));

      const renderer = getSharedRenderer(three);
      const canvas = renderer.domElement;
      if (canvas.width !== w || canvas.height !== h) {
        renderer.setSize(w, h, false);
      }
      const shadows = this.shadows();
      renderer.shadowMap.enabled = shadows;
      if (this.lastShadows !== null && this.lastShadows !== shadows) {
        // Three bakes the shadow-map flag into each compiled program and only
        // recompiles on a material or lights change, so flipping it alone
        // would leave every material on its old program.
        recompileMaterials(scene);
      }
      this.lastShadows = shadows;
      renderer.setViewport(0, 0, w, h);
      renderer.setClearColor(0x000000, 0);
      renderer.clear();
      if (this.onRender) {
        this.onRender(renderer, scene, camera);
      } else {
        renderer.render(scene, camera);
      }

      context.save();
      // Keep the image inside the rounded outline (matters once
      // `background` makes it opaque).
      context.clip(this.getPath());
      context.imageSmoothingEnabled = true;
      context.drawImage(
        canvas,
        0,
        0,
        w,
        h,
        -size.width / 2,
        -size.height / 2,
        size.width,
        size.height,
      );
      context.restore();
    }

    if (this.clip()) {
      context.clip(this.getPath());
    }
    this.drawChildren(context);
  }

  public override dispose() {
    this.root?.removeFromParent();
    this.rig = null;
    this.ownScene = null;
    this.ownFog = null;
    this.ownBackground = null;
    this.root = null;
    this.perspective = null;
    this.ortho = null;
    super.dispose();
  }
}

function nullableColor(value: PossibleColor | null): Color | null {
  return value === null || value === undefined ? null : new Color(value);
}

function isPerspective(camera: THREE.Camera): camera is THREE.PerspectiveCamera {
  return (camera as THREE.PerspectiveCamera).isPerspectiveCamera === true;
}

function isOrthographic(
  camera: THREE.Camera,
): camera is THREE.OrthographicCamera {
  return (camera as THREE.OrthographicCamera).isOrthographicCamera === true;
}

function recompileMaterials(scene: THREE.Scene) {
  scene.traverse(object => {
    const material = (object as THREE.Mesh).material;
    if (!material) {
      return;
    }
    for (const mat of Array.isArray(material) ? material : [material]) {
      mat.needsUpdate = true;
    }
  });
}

function hasLight(object: THREE.Object3D, ignore: THREE.Object3D | null): boolean {
  if (object === ignore) {
    return false;
  }
  if ((object as THREE.Light).isLight) {
    return true;
  }
  return object.children.some(child => hasLight(child, ignore));
}
