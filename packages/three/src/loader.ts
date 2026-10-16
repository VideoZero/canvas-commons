import {createSignal} from '@motion-canvas/core';
import type * as THREE from 'three';

/**
 * The Three.js module namespace, as returned by `import('three')`.
 */
export type ThreeModule = typeof THREE;

let LOADED: ThreeModule | null = null;
let PENDING: Promise<ThreeModule> | null = null;
let LOAD: () => Promise<ThreeModule> = () => import('three');
let LOAD_ADDON:
  | ((name: ThreeAddonName, revision: string) => Promise<unknown>)
  | null = null;
const ADDONS = new Map<ThreeAddonName, Promise<unknown>>();

/**
 * Flips to `true` once the runtime is available. Every access to the runtime
 * reads it, so a computed or signal function that asked too early is marked
 * dirty by the load and re-evaluates instead of staying cached at its failed
 * value (a computed that throws before reading any signal would otherwise
 * end up with no dependencies at all).
 */
const LOADED_SIGNAL = createSignal(false);

export interface ThreeConfig {
  /**
   * Override how the Three.js runtime is obtained.
   *
   * @remarks
   * Defaults to a dynamic `import('three')`, which bundlers split into a
   * separate chunk that is only fetched when the first {@link Three} node
   * renders. Hosts that vendor Three.js elsewhere can point this at their own
   * copy, e.g. `() => import('https://cdn.example.com/three.module.js')`.
   *
   * A namespace that keeps the runtime under `default` is unwrapped, so an
   * interop build works as well as the plain ESM one.
   */
  load?: () => Promise<ThreeModule>;
  /**
   * Register an already imported Three.js module.
   *
   * @remarks
   * Scenes that `import * as THREE from 'three'` themselves (to hand a raw
   * `scene` / `camera` to {@link Three}, or to build objects for
   * {@link Object3D}) can pass it here so the nodes share that instance
   * instead of importing a second copy.
   */
  module?: ThreeModule;
  /**
   * How {@link loadThreeAddon} fetches an addon module, given its name and
   * the loaded runtime's `REVISION` (e.g. `'186'`).
   *
   * @remarks
   * A module whose default export is a factory `(THREE) => exports` is called
   * with the loaded runtime — the engine vendors each addon in that shape
   * (`/assets/vendor/three-r<REVISION>-addon-<name>.js`), so it binds to the
   * runtime this loader holds rather than importing a second copy of
   * `three`, and a cached addon never meets a runtime of another revision.
   * Any other module namespace (e.g. `import('three/addons/…')` on a host
   * that bundles `three` itself) is returned as is. Without it,
   * `loadThreeAddon` rejects.
   */
  loadAddon?: (name: ThreeAddonName, revision: string) => Promise<unknown>;
}

/**
 * Configure how the Three.js runtime is loaded. Call before any 3D node
 * renders; a runtime that already loaded is kept.
 */
export function configureThree(config: ThreeConfig) {
  if (config.load) {
    LOAD = config.load;
  }
  if (config.loadAddon) {
    LOAD_ADDON = config.loadAddon;
  }
  if (config.module && !LOADED) {
    setLoaded(config.module);
  }
}

function setLoaded(mod: ThreeModule) {
  LOADED = mod;
  LOADED_SIGNAL(true);
}

/**
 * Whether the Three.js runtime has finished loading.
 *
 * @remarks
 * Reactive: a computed or signal function that reads it re-evaluates once
 * the runtime arrives.
 */
export function isThreeLoaded(): boolean {
  return LOADED_SIGNAL() && LOADED !== null;
}

/**
 * Whether a load of the runtime has been started and is still in flight.
 *
 * @remarks
 * Not reactive. Together with {@link isThreeLoaded} it tells generator code
 * apart from signal functions: a value read while nothing has started
 * loading (before the first {@link Three} node rendered) will never update
 * on its own, so the nodes warn about that read.
 */
export function isThreeLoading(): boolean {
  return PENDING !== null && LOADED === null;
}

/**
 * Start (or join) loading the Three.js runtime.
 *
 * @remarks
 * A {@link Three} node calls this when it first renders, so most scenes never
 * need to. Generator code that reads 3D values (`screenPosition()`,
 * `projectPoint()`, `rootGroup()`, `mesh()`) must wait for the runtime first:
 * `yield stage()` on the Three node does that (and also waits for pending
 * fonts), or yield this promise when no node is at hand:
 * ```tsx
 * yield loadThree();
 * label().position(box().screenPosition());
 * ```
 */
export function loadThree(): Promise<ThreeModule> {
  if (LOADED) {
    return Promise.resolve(LOADED);
  }
  if (!PENDING) {
    PENDING = LOAD().then(mod => {
      // A custom `load` may hand back a namespace that keeps the runtime under
      // `default` — a CDN interop build, or a build-time stub aliased over the
      // bare `three` specifier. The real ESM build has no default export, so
      // reading it there is undefined and the namespace itself is used.
      const runtime = ((mod as {default?: ThreeModule})?.default ??
        mod) as ThreeModule;
      setLoaded(runtime);
      return runtime;
    });
  }
  return PENDING;
}

/**
 * Get the loaded Three.js runtime.
 *
 * @remarks
 * Throws if the runtime has not loaded yet. Inside a signal or computed the
 * signal system catches and logs the throw and the value stays at its
 * fallback; the read of the load state made here marks that context dirty,
 * so it re-evaluates once the runtime arrives. Code that runs before the
 * first render (scene setup, generator code) should `yield loadThree()`
 * first or check {@link isThreeLoaded}.
 */
export function getThree(): ThreeModule {
  if (!isThreeLoaded()) {
    throw new Error(
      'Three.js has not loaded yet. Inside a scene, `yield loadThree()` before reading 3D objects, or read them from a signal function or onUpdate callback instead.',
    );
  }
  return LOADED!;
}

/**
 * The Three.js addons (three/examples/jsm) {@link loadThreeAddon} can fetch.
 * Related classes share one addon: `Line2` also carries `LineGeometry`,
 * `LineMaterial`, `LineSegments2` and `LineSegmentsGeometry`; `TextGeometry`
 * carries `FontLoader` and `Font`; `ParametricGeometry` carries the
 * `klein` / `plane` / `mobius` / `mobius3d` surface functions.
 */
export const THREE_ADDONS = [
  'RoundedBoxGeometry',
  'BufferGeometryUtils',
  'TextGeometry',
  'ConvexGeometry',
  'ParametricGeometry',
  'Line2',
  'RoomEnvironment',
  'GLTFLoader',
  'SVGLoader',
  'SimplexNoise',
  'ImprovedNoise',
  'MeshSurfaceSampler',
] as const;

export type ThreeAddonName = (typeof THREE_ADDONS)[number];

/** What each addon resolves to. */
export interface ThreeAddons {
  RoundedBoxGeometry: typeof import('three/examples/jsm/geometries/RoundedBoxGeometry.js');
  BufferGeometryUtils: typeof import('three/examples/jsm/utils/BufferGeometryUtils.js');
  TextGeometry: typeof import('three/examples/jsm/geometries/TextGeometry.js') &
    typeof import('three/examples/jsm/loaders/FontLoader.js') & {
      /**
       * Load a typeface the engine serves next to the addon (Helvetiker,
       * Latin glyphs only): `const font = yield loadFont('helvetiker-bold')`.
       */
      loadFont(
        name?: 'helvetiker' | 'helvetiker-bold',
      ): Promise<import('three/examples/jsm/loaders/FontLoader.js').Font>;
    };
  ConvexGeometry: typeof import('three/examples/jsm/geometries/ConvexGeometry.js');
  ParametricGeometry: typeof import('three/examples/jsm/geometries/ParametricGeometry.js') &
    typeof import('three/examples/jsm/geometries/ParametricFunctions.js');
  Line2: typeof import('three/examples/jsm/lines/Line2.js') &
    typeof import('three/examples/jsm/lines/LineGeometry.js') &
    typeof import('three/examples/jsm/lines/LineMaterial.js') &
    typeof import('three/examples/jsm/lines/LineSegments2.js') &
    typeof import('three/examples/jsm/lines/LineSegmentsGeometry.js');
  RoomEnvironment: typeof import('three/examples/jsm/environments/RoomEnvironment.js');
  GLTFLoader: typeof import('three/examples/jsm/loaders/GLTFLoader.js');
  SVGLoader: typeof import('three/examples/jsm/loaders/SVGLoader.js');
  SimplexNoise: typeof import('three/examples/jsm/math/SimplexNoise.js');
  ImprovedNoise: typeof import('three/examples/jsm/math/ImprovedNoise.js');
  MeshSurfaceSampler: typeof import('three/examples/jsm/math/MeshSurfaceSampler.js');
}

/**
 * Load a Three.js addon (three/examples/jsm) on demand, bound to the same
 * runtime as {@link loadThree} — so its classes extend the runtime's
 * (`instanceof THREE.BufferGeometry` holds) and only scenes that ask for an
 * addon download it. Also loads the runtime itself.
 *
 * @remarks
 * Scenes cannot `import` from `three/addons/*`; yield this instead:
 * ```tsx
 * const THREE = yield loadThree();
 * const {RoundedBoxGeometry} = yield loadThreeAddon('RoundedBoxGeometry');
 * ```
 * Every addon is fetched once and cached. Rejects for a name that is not in
 * {@link THREE_ADDONS} or when the host configured no
 * {@link ThreeConfig.loadAddon}.
 */
export function loadThreeAddon<N extends ThreeAddonName>(
  name: N,
): Promise<ThreeAddons[N]> {
  let pending = ADDONS.get(name);
  if (!pending) {
    if (!(THREE_ADDONS as readonly string[]).includes(name)) {
      return Promise.reject(
        new Error(
          `Unknown Three.js addon "${name}". Available: ${THREE_ADDONS.join(', ')}.`,
        ),
      );
    }
    const load = LOAD_ADDON;
    if (!load) {
      return Promise.reject(
        new Error(
          `Three.js addons are not available on this host (configureThree({loadAddon}) was never called).`,
        ),
      );
    }
    pending = loadThree().then(async three => {
      const mod = await load(name, String(three.REVISION));
      const factory = (mod as {default?: unknown})?.default;
      return typeof factory === 'function' ? factory(three) : mod;
    });
    // A failed fetch must not stay cached: the next call retries.
    pending.catch(() => ADDONS.delete(name));
    ADDONS.set(name, pending);
  }
  return pending as Promise<ThreeAddons[N]>;
}
