import {colorSignal, initial, nodeName, signal} from '@motion-canvas/2d';
import {
  ColorSignal,
  PossibleColor,
  SignalValue,
  SimpleSignal,
} from '@motion-canvas/core';
import type * as THREE from 'three';
import {Object3DNode, Object3DNodeProps} from './Object3DNode';
import {ThreeModule} from './loader';
import {PIXELS_PER_UNIT, PossibleVector3, toRadians} from './units';

/**
 * Light types.
 *
 * - `ambient`: uniform fill from everywhere; no shading, no shadows.
 * - `hemisphere`: sky colour from above blending to `groundColor` below —
 *   the cheapest "looks lit" fill.
 * - `directional`: parallel rays like the sun, from the light's position
 *   toward {@link Light3D.target}. Casts crisp shadows.
 * - `point`: a bulb radiating in all directions from its position.
 * - `spot`: a cone from the position toward {@link Light3D.target}.
 */
export type Light3DKind =
  | 'ambient'
  | 'hemisphere'
  | 'directional'
  | 'point'
  | 'spot';

export interface Light3DProps extends Object3DNodeProps {
  /**
   * {@inheritDoc Light3D.kind}
   */
  kind?: SignalValue<Light3DKind>;
  /**
   * {@inheritDoc Light3D.color}
   */
  color?: SignalValue<PossibleColor>;
  /**
   * {@inheritDoc Light3D.intensity}
   */
  intensity?: SignalValue<number>;
  /**
   * {@inheritDoc Light3D.groundColor}
   */
  groundColor?: SignalValue<PossibleColor>;
  /**
   * {@inheritDoc Light3D.target}
   */
  target?: SignalValue<PossibleVector3>;
  /**
   * {@inheritDoc Light3D.angle}
   */
  angle?: SignalValue<number>;
  /**
   * {@inheritDoc Light3D.penumbra}
   */
  penumbra?: SignalValue<number>;
  /**
   * {@inheritDoc Light3D.decay}
   */
  decay?: SignalValue<number>;
  /**
   * {@inheritDoc Light3D.castShadow}
   */
  castShadow?: SignalValue<boolean>;
  /**
   * {@inheritDoc Light3D.shadowArea}
   */
  shadowArea?: SignalValue<number>;
}

/**
 * A light source inside a {@link Three} scene.
 *
 * @remarks
 * Position it like any 3D node (pixels; `z` toward the camera). A scene with
 * no lights gets a neutral default rig from {@link Three}, so add lights only
 * when you want to art-direct them.
 *
 * @example
 * ```tsx
 * <Three width={800} height={600} shadows>
 *   <Light3D kind="hemisphere" intensity={0.6} />
 *   <Light3D kind="directional" position={[-300, -500]} z={600} intensity={2} castShadow />
 *   <Mesh3D geometry="sphere" size={200} color="#f43f5e" />
 *   <Mesh3D geometry="plane" size={[1200, 1200]} rotationX={90} y={120} color="#1f2937" />
 * </Three>
 * ```
 */
@nodeName('Light3D')
export class Light3D extends Object3DNode {
  /**
   * The type of light.
   */
  @initial('directional')
  @signal()
  public declare readonly kind: SimpleSignal<Light3DKind, this>;

  /**
   * Light colour.
   */
  @initial('#ffffff')
  @colorSignal()
  public declare readonly color: ColorSignal<this>;

  /**
   * Brightness. `1` is a sensible default for every kind; sunlight-strength
   * directionals sit around `2`–`3`.
   */
  @initial(1)
  @signal()
  public declare readonly intensity: SimpleSignal<number, this>;

  /**
   * `hemisphere` only: the colour bounced up from below.
   */
  @initial('#444444')
  @colorSignal()
  public declare readonly groundColor: ColorSignal<this>;

  /**
   * `directional` / `spot` only: the point (in pixels) the light aims at.
   */
  @initial([0, 0, 0])
  @signal()
  public declare readonly target: SimpleSignal<PossibleVector3, this>;

  /**
   * `spot` only: cone half-angle in degrees.
   */
  @initial(30)
  @signal()
  public declare readonly angle: SimpleSignal<number, this>;

  /**
   * `spot` only: softness of the cone edge, 0–1.
   */
  @initial(0.3)
  @signal()
  public declare readonly penumbra: SimpleSignal<number, this>;

  /**
   * `point` / `spot` only: distance falloff. `0` (default) means none, so
   * intensity reads the same wherever the light sits; `2` is physically
   * correct inverse-square falloff (then raise intensity a lot).
   */
  @initial(0)
  @signal()
  public declare readonly decay: SimpleSignal<number, this>;

  /**
   * Whether this light casts shadows. Also needs `shadows` on the
   * {@link Three} node.
   */
  @initial(false)
  @signal()
  public declare readonly castShadow: SimpleSignal<boolean, this>;

  /**
   * `directional` only: side length in pixels of the square area around the
   * target that receives shadows.
   */
  @initial(2400)
  @signal()
  public declare readonly shadowArea: SimpleSignal<number, this>;

  private light: THREE.Light | null = null;
  private lightKind: Light3DKind | null = null;

  public constructor(props?: Light3DProps) {
    super(props ?? {});
  }

  protected override createObject(three: ThreeModule): THREE.Object3D {
    // A holder group keeps the node's object stable while the light inside
    // is swapped when `kind` changes.
    return new three.Group();
  }

  protected override updateObject(three: ThreeModule, object: THREE.Object3D) {
    const kind = this.kind();
    if (!this.light || this.lightKind !== kind) {
      if (this.light) {
        object.remove(this.light);
        targetOf(this.light)?.removeFromParent();
        this.light.dispose();
      }
      this.light = createLight(three, kind);
      this.lightKind = kind;
      object.add(this.light);
    }

    const light = this.light;
    light.color.set(this.color().hex());
    light.intensity = this.intensity() * this.opacity3D();

    if (light instanceof three.HemisphereLight) {
      light.groundColor.set(this.groundColor().hex());
    }

    if (
      light instanceof three.DirectionalLight ||
      light instanceof three.SpotLight
    ) {
      // `target` is given in the same space as the node's `position` (its
      // parent's, in pixels). The target object lives inside the holder so
      // it follows a transformed parent; express the point in holder space.
      if (light.target.parent !== object) {
        object.add(light.target);
      }
      const [tx, ty, tz] = this.target();
      object.updateMatrix();
      light.target.position
        .set(tx, -ty, tz)
        .applyMatrix4(object.matrix.clone().invert());
      light.castShadow = this.castShadow();
      light.shadow.mapSize.set(2048, 2048);
      light.shadow.bias = -0.0005;
      light.shadow.normalBias = 0.02;
    }

    if (light instanceof three.DirectionalLight) {
      const half = this.shadowArea() / 2 / PIXELS_PER_UNIT;
      const cam = light.shadow.camera;
      cam.left = -half;
      cam.right = half;
      cam.top = half;
      cam.bottom = -half;
      cam.near = 0.1;
      cam.far = 200;
      cam.updateProjectionMatrix();
    }

    if (light instanceof three.SpotLight) {
      light.angle = toRadians(this.angle());
      light.penumbra = this.penumbra();
      light.decay = this.decay();
      light.distance = 0;
    }

    if (light instanceof three.PointLight) {
      light.decay = this.decay();
      light.distance = 0;
      light.castShadow = this.castShadow();
      light.shadow.mapSize.set(1024, 1024);
      light.shadow.bias = -0.0005;
    }
  }

  public override dispose() {
    if (this.light) {
      targetOf(this.light)?.removeFromParent();
      this.light.dispose();
      this.light = null;
    }
    super.dispose();
  }
}

function targetOf(light: THREE.Light): THREE.Object3D | null {
  return (light as THREE.DirectionalLight).target ?? null;
}

function createLight(three: ThreeModule, kind: Light3DKind): THREE.Light {
  switch (kind) {
    case 'ambient':
      return new three.AmbientLight();
    case 'hemisphere':
      return new three.HemisphereLight();
    case 'directional':
      return new three.DirectionalLight();
    case 'point':
      return new three.PointLight();
    case 'spot':
      return new three.SpotLight();
  }
}
