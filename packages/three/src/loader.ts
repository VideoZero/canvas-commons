import {createSignal} from '@motion-canvas/core';
import type * as THREE from 'three';

/**
 * The Three.js module namespace, as returned by `import('three')`.
 */
export type ThreeModule = typeof THREE;

let LOADED: ThreeModule | null = null;
let PENDING: Promise<ThreeModule> | null = null;
let LOAD: () => Promise<ThreeModule> = () => import('three');

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
}

/**
 * Configure how the Three.js runtime is loaded. Call before any 3D node
 * renders; a runtime that already loaded is kept.
 */
export function configureThree(config: ThreeConfig) {
  if (config.load) {
    LOAD = config.load;
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
