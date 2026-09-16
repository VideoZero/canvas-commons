import type * as THREE from 'three';
import {ThreeModule} from './loader';

let shared: THREE.WebGLRenderer | null = null;

/**
 * The single WebGL renderer shared by every {@link Three} node.
 *
 * @remarks
 * Rendering is synchronous — each node renders its scene and immediately
 * copies the result into the 2D canvas — so one renderer (one WebGL context)
 * can serve any number of nodes. The canvas is resized on demand.
 */
export function getSharedRenderer(three: ThreeModule): THREE.WebGLRenderer {
  if (!shared) {
    shared = new three.WebGLRenderer({
      canvas: document.createElement('canvas'),
      antialias: true,
      alpha: true,
      premultipliedAlpha: true,
      preserveDrawingBuffer: false,
      powerPreference: 'high-performance',
    });
    shared.setPixelRatio(1);
    shared.shadowMap.enabled = false;
    shared.shadowMap.type = three.PCFShadowMap;
  }
  return shared;
}

/**
 * Release the shared renderer and its WebGL context.
 */
export function disposeSharedRenderer() {
  if (shared) {
    shared.dispose();
    shared.forceContextLoss();
    shared = null;
  }
}
