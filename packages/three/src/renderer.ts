import {useLogger} from '@canvas-commons/core';
import type * as THREE from 'three';
import {disposeEnvironments} from './environment';
import {ThreeModule} from './loader';

let SHARED: THREE.WebGLRenderer | null = null;
let ANTIALIAS = true;
/** The shared renderer's context was lost; the next render replaces it. */
let LOST = false;
let DISPOSING = false;
let LOSSES = 0;

/**
 * Whether new renderers are created with multisampling.
 */
export function getRendererAntialias(): boolean {
  return ANTIALIAS;
}

/**
 * Turn multisampling on or off for the shared renderer.
 *
 * @remarks
 * Antialiasing is a WebGL context attribute, so it can only be chosen when
 * the context is created: changing it releases the current renderer and the
 * next render builds a fresh one. Set it before the first 3D node renders.
 * Turning it off cuts frame time by roughly a third when WebGL runs in
 * software (headless rendering without a GPU) at the cost of jagged edges;
 * on a real GPU it saves very little.
 */
export function setRendererAntialias(enabled: boolean) {
  if (ANTIALIAS === enabled) {
    return;
  }
  ANTIALIAS = enabled;
  disposeSharedRenderer();
}

/**
 * The single WebGL renderer shared by every {@link Three} node.
 *
 * @remarks
 * Rendering is synchronous — each node renders its scene and immediately
 * copies the result into the 2D canvas — so one renderer (one WebGL context)
 * can serve any number of nodes. The canvas is resized on demand.
 */
export function getSharedRenderer(three: ThreeModule): THREE.WebGLRenderer {
  if (SHARED && LOST) {
    // Three.js itself only waits for `webglcontextrestored`, and until then
    // every render returns silently — a long headless export would carry on
    // with blank 3D frames. Build a fresh renderer (and context) instead:
    // geometry, materials and textures are plain Three objects that
    // re-upload to whichever renderer draws them. If no new context can be
    // created, the constructor throws and the frame fails loudly.
    disposeSharedRenderer();
    useLogger().warn({
      message: `WebGL context lost; rebuilt the shared 3D renderer (${LOSSES} loss${LOSSES === 1 ? '' : 'es'} so far).`,
    });
  }
  if (!SHARED) {
    const canvas = document.createElement('canvas');
    canvas.addEventListener(
      'webglcontextlost',
      event => {
        // Only a loss we did not cause, on the renderer still in use.
        if (DISPOSING || SHARED?.domElement !== canvas) {
          return;
        }
        event.preventDefault();
        LOST = true;
        LOSSES++;
      },
      false,
    );
    SHARED = new three.WebGLRenderer({
      canvas,
      antialias: ANTIALIAS,
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
    DISPOSING = true;
    try {
      disposeEnvironments(SHARED);
      SHARED.dispose();
      if (!LOST) {
        SHARED.forceContextLoss();
      }
    } finally {
      DISPOSING = false;
      SHARED = null;
      LOST = false;
    }
  }
}

/**
 * Tone mapping applied to the 3D image.
 *
 * - `none` (default): colours are written as lit, values above 1 clip.
 * - `linear`: exposure only.
 * - `neutral`: Khronos PBR Neutral — leaves base colours almost untouched
 *   and only rolls off highlights. The right choice when the palette must
 *   stay recognisable.
 * - `aces`: ACES filmic — contrasty, desaturates and shifts bright colours.
 * - `agx`: AgX — soft filmic roll-off, noticeably desaturates.
 */
export type ThreeToneMapping = 'none' | 'linear' | 'neutral' | 'aces' | 'agx';

/**
 * Shadow-map filtering.
 *
 * - `pcf` (default): filtered depth comparisons. In Three.js r180 and later
 *   it is softened by the light's shadow `radius`, but with only five
 *   samples: a large radius looks grainy rather than soft — use `vsm` for
 *   wide penumbrae.
 * - `pcfsoft`: softer PCF where the runtime still has it; newer Three.js
 *   versions removed it, and it falls back to `pcf` there.
 * - `vsm`: variance shadow maps — blurred, smooth penumbrae whose width
 *   follows the light's shadow `radius`. The softest look, for contact
 *   shadows on a studio floor. Point lights cast no VSM shadows, and the
 *   surface a shadow lands on must cast shadows too (VSM blurs the
 *   receiver's depth into the penumbra).
 *
 * All 3D nodes share one renderer, and Three.js rebuilds every shadow map
 * (and re-prepares the materials) of the scene it renders whenever the type
 * differs from the previous render. Mixing types between nodes in one scene
 * therefore costs that rebuild on each switch, every frame: keep one type
 * per scene.
 */
export type ThreeShadowType = 'pcf' | 'pcfsoft' | 'vsm';

/**
 * The renderer settings a {@link Three} node renders with.
 *
 * @internal
 */
export interface ThreeRenderState {
  shadows: boolean;
  shadowType: ThreeShadowType;
  toneMapping: ThreeToneMapping;
  toneMappingExposure: number;
}

/**
 * The Three.js constant for a tone mapping name.
 *
 * @internal
 */
export function toneMappingConstant(
  three: ThreeModule,
  name: ThreeToneMapping,
): THREE.ToneMapping {
  switch (name) {
    case 'linear':
      return three.LinearToneMapping;
    case 'neutral':
      return three.NeutralToneMapping ?? three.ACESFilmicToneMapping;
    case 'aces':
      return three.ACESFilmicToneMapping;
    case 'agx':
      return three.AgXToneMapping ?? three.ACESFilmicToneMapping;
    default:
      return three.NoToneMapping;
  }
}

/**
 * The Three.js constant for a shadow type name.
 *
 * @internal
 */
export function shadowTypeConstant(
  three: ThreeModule,
  name: ThreeShadowType,
): THREE.ShadowMapType {
  switch (name) {
    case 'vsm':
      return three.VSMShadowMap;
    case 'pcfsoft':
      // Three.js r180+ dropped the PCF_SOFT shader path and warns on every
      // shadow pass when the type is still requested; its PCF is soft now.
      return hasPcfSoft(three) ? three.PCFSoftShadowMap : three.PCFShadowMap;
    default:
      return three.PCFShadowMap;
  }
}

const PCF_SOFT = new WeakMap<object, boolean>();

/**
 * Whether the runtime still has a PCF_SOFT shadow path. Read once per
 * runtime; a module without the shader chunks counts as not having it.
 *
 * @internal
 */
export function hasPcfSoft(three: ThreeModule): boolean {
  let soft = PCF_SOFT.get(three);
  if (soft === undefined) {
    const chunk = three.ShaderChunk?.shadowmap_pars_fragment;
    soft =
      typeof chunk === 'string' && chunk.includes('SHADOWMAP_TYPE_PCF_SOFT');
    PCF_SOFT.set(three, soft);
  }
  return soft;
}

/**
 * Put `state` on the shared renderer for one render and return a function
 * that puts the previous settings back.
 *
 * @remarks
 * Every {@link Three} node shares one renderer, so a node applies its own
 * settings right before it renders and restores them right after: nothing
 * one node chooses leaks into another, or into code that uses
 * {@link getSharedRenderer} directly. Three.js tracks tone mapping and the
 * shadow-map type per compiled program (shadow type changes recompile the
 * scene being rendered), so restoring costs nothing as long as the next
 * render uses the same settings again.
 *
 * @internal
 */
export function applyRenderState(
  three: ThreeModule,
  renderer: THREE.WebGLRenderer,
  state: ThreeRenderState,
): () => void {
  const previous = {
    enabled: renderer.shadowMap.enabled,
    type: renderer.shadowMap.type,
    toneMapping: renderer.toneMapping,
    exposure: renderer.toneMappingExposure,
  };
  renderer.shadowMap.enabled = state.shadows;
  renderer.shadowMap.type = shadowTypeConstant(three, state.shadowType);
  renderer.toneMapping = toneMappingConstant(three, state.toneMapping);
  renderer.toneMappingExposure = Math.max(0, state.toneMappingExposure);
  return () => {
    renderer.shadowMap.enabled = previous.enabled;
    renderer.shadowMap.type = previous.type;
    renderer.toneMapping = previous.toneMapping;
    renderer.toneMappingExposure = previous.exposure;
  };
}

/**
 * Run `render` with `state` on the shared renderer, restoring the previous
 * settings afterwards — also when `render` throws.
 *
 * @internal
 */
export function withRenderState<T>(
  three: ThreeModule,
  renderer: THREE.WebGLRenderer,
  state: ThreeRenderState,
  render: () => T,
): T {
  const restore = applyRenderState(three, renderer, state);
  try {
    return render();
  } finally {
    restore();
  }
}

/**
 * How many times the shared renderer's WebGL context has been lost (and
 * rebuilt on the next render) since the page loaded.
 */
export function getContextLossCount(): number {
  return LOSSES;
}

// When this module is hot-replaced during development the next version
// creates its own renderer; release this one so edits do not pile up WebGL
// contexts until the browser starts dropping them.
(import.meta as {hot?: {dispose(callback: () => void): void}}).hot?.dispose(
  disposeSharedRenderer,
);
