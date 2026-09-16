import type * as THREE from 'three';
import {ThreeModule} from './loader';

let SHARED: THREE.WebGLRenderer | null = null;

/**
 * The single WebGL renderer shared by every {@link Three} node.
 *
 * @remarks
 * Rendering is synchronous — each node renders its scene and immediately
 * copies the result into the 2D canvas — so one renderer (one WebGL context)
 * can serve any number of nodes. The canvas is resized on demand.
 */
export function getSharedRenderer(three: ThreeModule): THREE.WebGLRenderer {
  if (!SHARED) {
    SHARED = new three.WebGLRenderer({
      canvas: document.createElement('canvas'),
      antialias: true,
      alpha: true,
      premultipliedAlpha: true,
      preserveDrawingBuffer: false,
      powerPreference: 'high-performance',
    });
    SHARED.setPixelRatio(1);
    SHARED.shadowMap.enabled = false;
    SHARED.shadowMap.type = three.PCFShadowMap;
  }
  return SHARED;
}

/**
 * Release the shared renderer and its WebGL context.
 */
export function disposeSharedRenderer() {
  if (SHARED) {
    SHARED.dispose();
    SHARED.forceContextLoss();
    SHARED = null;
  }
}

// When this module is hot-replaced during development the next version
// creates its own renderer; release this one so edits do not pile up WebGL
// contexts until the browser starts dropping them.
(import.meta as {hot?: {dispose(callback: () => void): void}}).hot?.dispose(
  disposeSharedRenderer,
);
