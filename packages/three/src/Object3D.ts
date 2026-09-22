import {initial, nodeName, signal} from '@motion-canvas/2d';
import {SignalValue, SimpleSignal} from '@motion-canvas/core';
import type * as THREE from 'three';
import {setTransparent} from './Mesh3D';
import {Object3DNode, Object3DNodeProps} from './Object3DNode';
import {ThreeModule} from './loader';
import {reportCallbackError} from './report';

interface MaterialState {
  baseOpacity: number;
  appliedOpacity: number;
  baseTransparent: boolean;
  appliedTransparent: boolean;
}

/**
 * Per material: the opacity / transparency the user gave it (`base`) and
 * what an Object3D node last wrote (`applied`). A value that no longer
 * matches `applied` was changed by the user (in `update` or outside) and
 * becomes the new base, so the node's opacity multiplies user edits instead
 * of clobbering them.
 *
 * Kept per material rather than per node: a prebuilt `object` outlives the
 * node (scenes are rebuilt on every seek back and replay), and the next node
 * must recognise the faded value as its own doing, not as the user's base.
 */
const MATERIAL_STATE = new WeakMap<THREE.Material, MaterialState>();

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
 * An error thrown by `create` or `update` is logged against the node and
 * the sync carries on: a failed `create` leaves the node empty, a failed
 * `update` leaves the object as it was. Neither takes the other nodes in the
 * {@link Three} down.
 *
 * `create` and `update` survive {@link clone}, and the clone builds its own
 * object. An object built by `create` is disposed (geometries and materials)
 * with the node; a supplied `object` is not. A supplied {@link object} is
 * copied by reference instead: a Three.js object has one parent, so the node
 * synced last takes it from the other. Give each clone its own `object`.
 * Note that `object.clone()` shares geometries and materials with the
 * original, and the node writes its `opacity` to the materials, so two nodes
 * at different opacities would overwrite each other on every sync. Clone the
 * materials as well, or build the object with `create`, which gives every
 * clone its own:
 * ```ts
 * const copy = object.clone();
 * copy.traverse(child => {
 *   const mesh = child as THREE.Mesh;
 *   if (mesh.material) {
 *     mesh.material = Array.isArray(mesh.material)
 *       ? mesh.material.map(m => m.clone())
 *       : mesh.material.clone();
 *   }
 * });
 * ```
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
  private createFailed = false;
  private attached: THREE.Object3D | null = null;

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

  public override instantiate(props: Object3DProps = {}): this {
    return super.instantiate({
      create: this.create ?? undefined,
      update: this.update ?? undefined,
      ...props,
    });
  }

  protected override createObject(three: ThreeModule): THREE.Object3D {
    const holder = new three.Group();
    holder.name = 'Object3D';
    return holder;
  }

  protected override updateObject(three: ThreeModule, holder: THREE.Object3D) {
    let raw = this.object();
    if (!raw && this.create && !this.created && !this.createFailed) {
      try {
        this.created = this.create(three);
      } catch (e) {
        // Not retried: the factory takes no signals, so running it again on
        // the next sync would only repeat the same error.
        this.createFailed = true;
        reportCallbackError(this, 'Object3D create', e);
      }
    }
    raw ??= this.created;
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
    // `update` first so edits made there are the base the opacity multiplies.
    if (this.update) {
      try {
        this.update(raw, three);
      } catch (e) {
        reportCallbackError(this, 'Object3D update', e);
      }
    }
    this.applyOpacity(raw, this.opacity3D());
  }

  private applyOpacity(raw: THREE.Object3D, opacity: number) {
    raw.traverse(child => {
      const material = (child as THREE.Mesh).material;
      if (!material) {
        return;
      }
      for (const mat of Array.isArray(material) ? material : [material]) {
        let state = MATERIAL_STATE.get(mat);
        if (!state) {
          if (opacity >= 1) {
            continue;
          }
          state = {
            baseOpacity: mat.opacity,
            appliedOpacity: mat.opacity,
            baseTransparent: mat.transparent,
            appliedTransparent: mat.transparent,
          };
          MATERIAL_STATE.set(mat, state);
        }
        if (mat.opacity !== state.appliedOpacity) {
          state.baseOpacity = mat.opacity;
        }
        if (mat.transparent !== state.appliedTransparent) {
          state.baseTransparent = mat.transparent;
        }
        const transparent = opacity < 1 || state.baseTransparent;
        mat.opacity = state.baseOpacity * opacity;
        setTransparent(mat, transparent);
        state.appliedOpacity = mat.opacity;
        state.appliedTransparent = mat.transparent;
      }
    });
  }

  public override dispose() {
    if (this.attached) {
      this.attached.removeFromParent();
      this.attached = null;
    }
    // The node built this object, so it owns its GPU resources; a supplied
    // `object` belongs to the caller and is left alone.
    this.created?.traverse(child => {
      const mesh = child as THREE.Mesh;
      mesh.geometry?.dispose();
      const material = mesh.material;
      if (material) {
        for (const mat of Array.isArray(material) ? material : [material]) {
          mat.dispose();
        }
      }
    });
    this.created = null;
    this.createFailed = false;
    super.dispose();
  }
}
