import {initial, nodeName, signal} from '@motion-canvas/2d';
import {SignalValue, SimpleSignal} from '@motion-canvas/core';
import type * as THREE from 'three';
import {setTransparent} from './Mesh3D';
import {Object3DNode, Object3DNodeProps} from './Object3DNode';
import {ThreeModule} from './loader';

export interface Object3DFactory {
  (three: ThreeModule): THREE.Object3D;
}

export interface Object3DUpdate {
  (object: THREE.Object3D, three: ThreeModule): void;
}

export interface Object3DProps extends Object3DNodeProps {
  /**
   * {@inheritDoc Object3D.object}
   */
  object?: SignalValue<THREE.Object3D | null>;
  /**
   * Build the Three.js object lazily, once the runtime has loaded. The
   * alternative to {@link object} when the scene does not import `three`
   * itself.
   */
  create?: Object3DFactory;
  /**
   * Called (with signal tracking) every time the node syncs. Read signals
   * inside it to drive properties the node has no signal for; it re-runs
   * whenever one of them changes.
   */
  update?: Object3DUpdate;
}

/**
 * Any hand-built Three.js object as a node — the escape hatch between the
 * primitives of {@link Mesh3D} and a fully raw scene.
 *
 * @remarks
 * The object keeps its own local transform; the node's transform signals
 * (`position`, `z`, `rotation*`, `scale*`, `opacity`, `visible`) are applied
 * to a wrapper group, so a glTF root or a mesh with a baked offset works
 * unchanged. Units are pixels (the object sits inside the pixel-scaled root
 * of the enclosing {@link Three}), so `new BoxGeometry(200, 200, 200)` is a
 * 200 px cube.
 *
 * Two conventions meet here, on purpose: the node's props are Motion Canvas
 * (pixels, y down, degrees), while whatever you write inside `create` /
 * `update` is Three.js local space (pixels, **y up**, radians). Translate
 * geometry to anchor it (`geometry.translate(0, height / 2, 0)` puts the
 * pivot at the bottom) and leave placement to the node's `x` / `y` / `z`.
 *
 * `opacity` is applied to every material below the object (they are switched
 * to `transparent`); at `0` the object is hidden.
 *
 * @example
 * ```tsx
 * const knot = createRef<Object3D>();
 * <Three width={800} height={600}>
 *   <Object3D
 *     ref={knot}
 *     create={three =>
 *       new three.Mesh(
 *         new three.TorusKnotGeometry(90, 28, 160, 24),
 *         new three.MeshStandardMaterial({color: '#f472b6'}),
 *       )
 *     }
 *   />
 * </Three>
 * yield* knot().rotationY(360, 4);
 * ```
 */
@nodeName('Object3D')
export class Object3D extends Object3DNode {
  /**
   * A ready-made Three.js object to show. Replacing it swaps the object.
   */
  @initial(null)
  @signal()
  public declare readonly object: SimpleSignal<THREE.Object3D | null, this>;

  public readonly create: Object3DFactory | null;
  public readonly update: Object3DUpdate | null;

  private created: THREE.Object3D | null = null;
  private attached: THREE.Object3D | null = null;
  private readonly materialDefaults = new WeakMap<
    THREE.Material,
    {opacity: number; transparent: boolean}
  >();

  public constructor(props?: Object3DProps) {
    const {create, update, ...rest} = props ?? {};
    super(rest);
    this.create = create ?? null;
    this.update = update ?? null;
  }

  /**
   * The raw Three.js object currently shown (`object`, or the result of
   * `create`), or `null` before the runtime has loaded.
   */
  public raw(): THREE.Object3D | null {
    return this.object() ?? this.created;
  }

  protected override createObject(three: ThreeModule): THREE.Object3D {
    const holder = new three.Group();
    holder.name = 'Object3D';
    return holder;
  }

  protected override updateObject(three: ThreeModule, holder: THREE.Object3D) {
    let raw = this.object();
    if (!raw && this.create) {
      raw = this.created ??= this.create(three);
    }
    if (this.attached !== raw) {
      if (this.attached) {
        holder.remove(this.attached);
      }
      if (raw) {
        holder.add(raw);
      }
      this.attached = raw;
    }
    if (!raw) {
      return;
    }
    this.applyOpacity(raw, this.opacity3D());
    this.update?.(raw, three);
  }

  private applyOpacity(raw: THREE.Object3D, opacity: number) {
    raw.traverse(child => {
      const material = (child as THREE.Mesh).material;
      if (!material) {
        return;
      }
      for (const mat of Array.isArray(material) ? material : [material]) {
        let defaults = this.materialDefaults.get(mat);
        if (!defaults) {
          if (opacity >= 1) {
            continue;
          }
          defaults = {opacity: mat.opacity, transparent: mat.transparent};
          this.materialDefaults.set(mat, defaults);
        }
        if (opacity >= 1) {
          mat.opacity = defaults.opacity;
          setTransparent(mat, defaults.transparent);
        } else {
          mat.opacity = defaults.opacity * opacity;
          setTransparent(mat, true);
        }
      }
    });
  }

  public override dispose() {
    if (this.attached) {
      this.attached.removeFromParent();
      this.attached = null;
    }
    this.created = null;
    super.dispose();
  }
}
