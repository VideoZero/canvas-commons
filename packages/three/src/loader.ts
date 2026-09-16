import type * as THREE from 'three';

/**
 * The Three.js module namespace, as returned by `import('three')`.
 */
export type ThreeModule = typeof THREE;

let LOADED: ThreeModule | null = null;
let PENDING: Promise<ThreeModule> | null = null;
let LOAD: () => Promise<ThreeModule> = () => import('three');

export interface ThreeConfig {
  /**
   * Override how the Three.js runtime is obtained.
   *
   * @remarks
   * Defaults to a dynamic `import('three')`, which bundlers split into a
   * separate chunk that is only fetched when the first {@link Three} node
   * renders. Hosts that vendor Three.js elsewhere can point this at their own
   * copy, e.g. `() => import('https://cdn.example.com/three.module.js')`.
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
    LOADED = config.module;
  }
}

/**
 * Whether the Three.js runtime has finished loading.
 */
export function isThreeLoaded(): boolean {
  return LOADED !== null;
}

/**
 * Start (or join) loading the Three.js runtime.
 */
export function loadThree(): Promise<ThreeModule> {
  if (LOADED) {
    return Promise.resolve(LOADED);
  }
  if (!PENDING) {
    PENDING = LOAD().then(mod => {
      LOADED = mod;
      return mod;
    });
  }
  return PENDING;
}

/**
 * Get the loaded Three.js runtime.
 *
 * @remarks
 * Throws if the runtime has not loaded yet. Nodes only reach for it after
 * {@link Three} has gated rendering on {@link loadThree}. Inside a signal or
 * computed the throw is caught by the signal system and logged, and the
 * stale value is kept, so check {@link isThreeLoaded} there instead.
 */
export function getThree(): ThreeModule {
  if (!LOADED) {
    throw new Error(
      'Three.js has not loaded yet. 3D nodes must be rendered inside a <Three> node, which loads the runtime.',
    );
  }
  return LOADED;
}
