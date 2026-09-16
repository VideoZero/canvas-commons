import {Node, NodeProps, computed, initial, signal} from '@motion-canvas/2d';
import {BBox, SignalValue, SimpleSignal, Vector2} from '@motion-canvas/core';
import type * as THREE from 'three';
import {ThreeModule, getThree} from './loader';
import {toRadians} from './units';

/**
 * Implemented by the {@link Three} root so 3D nodes can find it without a
 * circular import.
 *
 * @internal
 */
export interface Object3DRoot {
  three(): ThreeModule | null;
  projectObject(object: THREE.Object3D): Vector2;
  /**
   * Texels per pixel the root currently renders at (its on-screen scale times
   * `quality`). Off-screen surfaces rasterize at this scale to stay crisp.
   */
  renderScale(): number;
}

export function isObject3DRoot(node: unknown): node is Node & Object3DRoot {
  return (
    node instanceof Node &&
    typeof (node as unknown as Object3DRoot).projectObject === 'function'
  );
}

export interface Object3DNodeProps extends NodeProps {
  /**
   * {@inheritDoc Object3DNode.z}
   */
  z?: SignalValue<number>;
  /**
   * {@inheritDoc Object3DNode.rotationX}
   */
  rotationX?: SignalValue<number>;
  /**
   * {@inheritDoc Object3DNode.rotationY}
   */
  rotationY?: SignalValue<number>;
  /**
   * {@inheritDoc Object3DNode.scaleZ}
   */
  scaleZ?: SignalValue<number | null>;
  /**
   * {@inheritDoc Object3DNode.visible}
   */
  visible?: SignalValue<boolean>;
}

/**
 * Base class for nodes that live inside a {@link Three} scene.
 *
 * @remarks
 * A 3D node is an ordinary Motion Canvas node — it sits in the JSX tree, has a
 * `ref`, and every property is a signal that tweens — but instead of drawing
 * on the 2D canvas it owns a Three.js object. The familiar transform signals
 * are reused with pixel units and the same on-screen meaning as 2D nodes:
 *
 * - `position` / `x` / `y` place the object in the camera's target plane
 *   (y grows down, like every other node); {@link z} adds depth toward the
 *   camera.
 * - `rotation` turns the object clockwise on screen; {@link rotationX} tilts
 *   the top away from the camera; {@link rotationY} turns the right edge away.
 *   All in degrees.
 * - `scale` scales x and y; {@link scaleZ} overrides the depth scale
 *   (defaults to the x scale, so `scale={2}` is uniform).
 * - `opacity` fades the object (and its 3D children) by making its materials
 *   transparent. That is right for thin or convex shapes; a self-overlapping
 *   mesh (a knot, a model) shows its far side through the near side while
 *   fading. To fade a whole shot, tween the `opacity` of the {@link Three}
 *   node instead — that fades the finished image.
 *
 * 3D nodes nest: children of a 3D node move with it, like Three.js objects.
 * A parent's `size` is not inherited (it scales the parent's shape only),
 * so a child at `y={-120}` under a `300 × 100` box sits 120 px above its
 * pivot.
 */
export abstract class Object3DNode extends Node {
  /**
   * Depth in pixels; positive values move toward the camera.
   */
  @initial(0)
  @signal()
  public declare readonly z: SimpleSignal<number, this>;

  /**
   * Rotation around the horizontal axis in degrees. Positive tilts the top
   * edge away from the camera.
   */
  @initial(0)
  @signal()
  public declare readonly rotationX: SimpleSignal<number, this>;

  /**
   * Rotation around the vertical axis in degrees. Positive turns the right
   * edge away from the camera.
   */
  @initial(0)
  @signal()
  public declare readonly rotationY: SimpleSignal<number, this>;

  /**
   * Scale along the depth axis. `null` (the default) follows the x scale.
   */
  @initial(null)
  @signal()
  public declare readonly scaleZ: SimpleSignal<number | null, this>;

  /**
   * Whether the object (and its 3D children) is rendered.
   */
  @initial(true)
  @signal()
  public declare readonly visible: SimpleSignal<boolean, this>;

  private instance: THREE.Object3D | null = null;

  /**
   * Create the Three.js object this node controls. Called once, lazily, after
   * the runtime has loaded.
   */
  protected abstract createObject(three: ThreeModule): THREE.Object3D;

  /**
   * Push signal values onto the object. Called every time a dependency
   * changes; the transform and children are already handled.
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  protected updateObject(_three: ThreeModule, _object: THREE.Object3D): void {
    // Subclasses override.
  }

  /**
   * Opacity accumulated through the 3D ancestors of this node.
   */
  @computed()
  public opacity3D(): number {
    const parent = this.parent();
    const inherited = parent instanceof Object3DNode ? parent.opacity3D() : 1;
    return Math.max(0, Math.min(1, this.opacity())) * inherited;
  }

  /**
   * A 3D node draws nothing on the 2D canvas, so it passes no opacity down
   * to 2D descendants (the surface content of a {@link Mesh3D}); the
   * material's opacity ({@link opacity3D}) and the enclosing {@link Three}
   * node's own fade cover it. Keeping this at `1` means a fade of the mesh
   * or the viewport does not re-rasterize the surface content every frame.
   */
  public override absoluteOpacity(): number {
    return 1;
  }

  /**
   * The Three.js object, synced to the current signal values.
   *
   * @remarks
   * Only valid once the runtime has loaded, i.e. from inside a rendering
   * {@link Three} node. Mutating the returned object directly is allowed for
   * anything the node has no signal for; the properties the node does own are
   * overwritten on every sync.
   */
  @computed()
  public object3D(): THREE.Object3D {
    const three = getThree();
    if (!this.instance) {
      this.instance = this.createObject(three);
      this.instance.userData.node = this;
    }
    const object = this.instance;

    const position = this.position();
    const scale = this.scale();
    object.position.set(position.x, -position.y, this.z());
    object.rotation.set(
      -toRadians(this.rotationX()),
      toRadians(this.rotationY()),
      -toRadians(this.rotation()),
    );
    object.scale.set(scale.x, scale.y, this.scaleZ() ?? scale.x);
    object.visible = this.visible() && this.opacity3D() > 0;

    this.updateObject(three, object);
    syncObjectChildren(this, object);
    return object;
  }

  /**
   * Where the object's origin lands on screen, in the coordinate space of the
   * enclosing {@link Three} node.
   *
   * @remarks
   * Use it to pin 2D annotations to 3D points:
   * ```tsx
   * <Three ref={stage} width={800} height={600}>
   *   <Mesh3D ref={box} geometry="box" size={200} />
   *   <Txt text="box" position={() => box().screenPosition()} />
   * </Three>
   * ```
   * Returns zero until the runtime has loaded, and updates once it has: the
   * check goes through the root's runtime signal, so a label evaluated while
   * Three.js is still loading is re-evaluated after the load rather than
   * staying cached at zero.
   */
  public screenPosition(): Vector2 {
    const root = this.findAncestor(isObject3DRoot);
    if (!root || !root.three()) {
      return Vector2.zero;
    }
    return root.projectObject(this.object3D());
  }

  /**
   * 3D nodes are drawn by the enclosing {@link Three} root through Three.js,
   * never onto the 2D canvas, so the regular render pass skips them (and any
   * 2D children they use as surface content).
   */
  public override render() {
    // Intentionally empty.
  }

  /**
   * Nothing is drawn in 2D space, so the node contributes no area to the
   * cache bounding box of a cached ancestor.
   */
  public override cacheBBox(): BBox {
    return new BBox();
  }

  public override dispose() {
    if (this.instance) {
      this.instance.removeFromParent();
      this.instance = null;
    }
    super.dispose();
  }
}

/**
 * Make `object`'s Three.js children mirror `node`'s 3D children.
 *
 * @internal
 */
export function syncObjectChildren(node: Node, object: THREE.Object3D) {
  const wanted: THREE.Object3D[] = [];
  for (const child of node.children()) {
    if (child instanceof Object3DNode) {
      wanted.push(child.object3D());
    }
  }
  for (const existing of [...object.children]) {
    if (
      existing.userData.node instanceof Object3DNode &&
      !wanted.includes(existing)
    ) {
      object.remove(existing);
    }
  }
  for (const child of wanted) {
    if (child.parent !== object) {
      object.add(child);
    }
  }
}
