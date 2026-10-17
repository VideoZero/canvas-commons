/* eslint-disable @typescript-eslint/naming-convention -- Three.js export names */
import * as THREE from 'three';
import {describe, expect, test, vi} from 'vitest';
import {Light3D} from '../Light3D';
import {Three} from '../ThreeNode';
import {
  createStudioEnvironmentScene,
  disposeEnvironments,
  getEnvironmentTexture,
} from '../environment';
import {configureThree} from '../loader';
import {
  applyRenderState,
  disposeSharedRenderer,
  getContextLossCount,
  getRendererAntialias,
  getSharedRenderer,
  setRendererAntialias,
  shadowTypeConstant,
  toneMappingConstant,
  withRenderState,
} from '../renderer';
import {FAKE_THREE, FakeWebGLRenderer} from './fakes';
import {captureLogs, mockScene} from './mockScene';

const SCENE = mockScene();
configureThree({module: THREE});

/** The parts of a WebGLRenderer that the render state touches. */
function fakeRenderer() {
  return {
    shadowMap: {enabled: false, type: THREE.PCFShadowMap},
    toneMapping: THREE.NoToneMapping,
    toneMappingExposure: 1,
  } as unknown as THREE.WebGLRenderer;
}

describe('renderer state', () => {
  test('names map to the Three.js constants', () => {
    expect(toneMappingConstant(THREE, 'none')).toBe(THREE.NoToneMapping);
    expect(toneMappingConstant(THREE, 'linear')).toBe(THREE.LinearToneMapping);
    expect(toneMappingConstant(THREE, 'neutral')).toBe(
      THREE.NeutralToneMapping,
    );
    expect(toneMappingConstant(THREE, 'aces')).toBe(
      THREE.ACESFilmicToneMapping,
    );
    expect(toneMappingConstant(THREE, 'agx')).toBe(THREE.AgXToneMapping);
    expect(shadowTypeConstant(THREE, 'pcf')).toBe(THREE.PCFShadowMap);
    expect(shadowTypeConstant(THREE, 'vsm')).toBe(THREE.VSMShadowMap);
  });

  test('pcfsoft follows what the runtime supports', () => {
    const withChunk = (chunk: string | undefined) =>
      ({
        ...THREE,
        ShaderChunk:
          chunk === undefined
            ? undefined
            : {
                shadowmap_pars_fragment: chunk,
              },
      }) as unknown as typeof THREE;
    // An older runtime that still has the PCF_SOFT path keeps it.
    expect(
      shadowTypeConstant(
        withChunk('#elif defined( SHADOWMAP_TYPE_PCF_SOFT )'),
        'pcfsoft',
      ),
    ).toBe(THREE.PCFSoftShadowMap);
    // r180+ dropped it (and warns on every pass if asked): use PCF.
    expect(
      shadowTypeConstant(
        withChunk('#if defined( SHADOWMAP_TYPE_PCF )'),
        'pcfsoft',
      ),
    ).toBe(THREE.PCFShadowMap);
    // A runtime without shader chunks does not throw.
    expect(shadowTypeConstant(withChunk(undefined), 'pcfsoft')).toBe(
      THREE.PCFShadowMap,
    );
    // The bundled r186 is one of the newer ones.
    expect(shadowTypeConstant(THREE, 'pcfsoft')).toBe(THREE.PCFShadowMap);
  });

  test('a render that throws still restores the renderer', () => {
    const renderer = fakeRenderer();
    expect(() =>
      withRenderState(
        THREE,
        renderer,
        {
          shadows: true,
          shadowType: 'vsm',
          toneMapping: 'agx',
          toneMappingExposure: 3,
        },
        () => {
          expect(renderer.toneMapping).toBe(THREE.AgXToneMapping);
          throw new Error('clear failed');
        },
      ),
    ).toThrow('clear failed');
    expect(renderer.shadowMap.enabled).toBe(false);
    expect(renderer.shadowMap.type).toBe(THREE.PCFShadowMap);
    expect(renderer.toneMapping).toBe(THREE.NoToneMapping);
    expect(renderer.toneMappingExposure).toBe(1);
  });

  test('a render applies its settings and restores the previous ones', () => {
    const renderer = fakeRenderer();
    const restore = applyRenderState(THREE, renderer, {
      shadows: true,
      shadowType: 'vsm',
      toneMapping: 'neutral',
      toneMappingExposure: 1.2,
    });
    expect(renderer.shadowMap.enabled).toBe(true);
    expect(renderer.shadowMap.type).toBe(THREE.VSMShadowMap);
    expect(renderer.toneMapping).toBe(THREE.NeutralToneMapping);
    expect(renderer.toneMappingExposure).toBeCloseTo(1.2);

    restore();
    expect(renderer.shadowMap.enabled).toBe(false);
    expect(renderer.shadowMap.type).toBe(THREE.PCFShadowMap);
    expect(renderer.toneMapping).toBe(THREE.NoToneMapping);
    expect(renderer.toneMappingExposure).toBe(1);
  });

  test('two nodes in a row do not leak settings into each other', () => {
    const renderer = fakeRenderer();
    const restoreA = applyRenderState(THREE, renderer, {
      shadows: true,
      shadowType: 'vsm',
      toneMapping: 'aces',
      toneMappingExposure: 2,
    });
    restoreA();
    const restoreB = applyRenderState(THREE, renderer, {
      shadows: false,
      shadowType: 'pcf',
      toneMapping: 'none',
      toneMappingExposure: 1,
    });
    expect(renderer.shadowMap.type).toBe(THREE.PCFShadowMap);
    expect(renderer.toneMapping).toBe(THREE.NoToneMapping);
    expect(renderer.toneMappingExposure).toBe(1);
    restoreB();
  });

  test('the new Three props are opt-in', () => {
    const stage = new Three({width: 400, height: 300});
    expect(stage.toneMapping()).toBe('none');
    expect(stage.toneMappingExposure()).toBe(1);
    expect(stage.environment()).toBe(null);
    expect(stage.environmentIntensity()).toBe(1);
    expect(stage.shadowType()).toBe('pcf');
  });
});

describe('studio environment', () => {
  test('is a closed room lit by emissive panels', () => {
    const scene = createStudioEnvironmentScene(THREE);
    const meshes = scene.children.filter(
      (o): o is THREE.Mesh => (o as THREE.Mesh).isMesh,
    );
    // Room + six props + six panels.
    expect(meshes).toHaveLength(13);
    const room = meshes[0].material as THREE.MeshStandardMaterial;
    expect(room.side).toBe(THREE.BackSide);
    const panels = meshes.filter(
      m => (m.material as THREE.Material).type === 'MeshLambertMaterial',
    );
    expect(panels).toHaveLength(6);
    // Panels glow far brighter than white so they act as light sources.
    for (const panel of panels) {
      const material = panel.material as THREE.MeshLambertMaterial;
      expect(material.emissiveIntensity).toBeGreaterThan(1);
    }
    // Lowered like RoomEnvironment, so the PMREM camera at the origin sits
    // above the props instead of inside them.
    expect(scene.position.y).toBe(-3.5);
    expect(scene.children.some(o => (o as THREE.Light).isLight)).toBe(true);
  });
});

describe('Light3D shadowRadius', () => {
  function shadowOf(light: Light3D): THREE.LightShadow {
    return (light.object3D().children[0] as THREE.DirectionalLight).shadow;
  }

  test('defaults to Three.js own crisp shadow', () => {
    const shadow = shadowOf(new Light3D({castShadow: true}));
    expect(shadow.radius).toBe(1);
    expect(shadow.blurSamples).toBe(8);
  });

  test('a wide radius gets more blur taps', () => {
    const shadow = shadowOf(new Light3D({castShadow: true, shadowRadius: 12}));
    expect(shadow.radius).toBe(12);
    expect(shadow.blurSamples).toBe(16);
  });
});

describe('environment cache', () => {
  /** A PMREM generator stand-in that records its work. */
  function fakeThree(fail = false) {
    const generated: {dispose: ReturnType<typeof vi.fn>}[] = [];
    let calls = 0;
    class PMREMGenerator {
      public constructor(private readonly renderer: THREE.WebGLRenderer) {}
      public fromScene() {
        calls++;
        // Like the real one: switch target and state, then render.
        this.renderer.setRenderTarget({} as THREE.WebGLRenderTarget);
        this.renderer.autoClear = false;
        if (fail) {
          throw new Error('context lost');
        }
        const target = {texture: new THREE.Texture(), dispose: vi.fn()};
        generated.push(target);
        return target;
      }
      public dispose() {}
    }
    const three = {...THREE, PMREMGenerator} as unknown as typeof THREE;
    return {three, generated, calls: () => calls};
  }

  function fakeGlRenderer() {
    let target: THREE.WebGLRenderTarget | null = null;
    return {
      autoClear: true,
      toneMapping: THREE.NoToneMapping,
      getRenderTarget: () => target,
      setRenderTarget: (next: THREE.WebGLRenderTarget | null) => {
        target = next;
      },
    } as unknown as THREE.WebGLRenderer;
  }

  test('generates once per renderer and again after a dispose', () => {
    const {three, generated, calls} = fakeThree();
    const a = fakeGlRenderer();
    const b = fakeGlRenderer();
    const first = getEnvironmentTexture(three, a, 'studio');
    expect(getEnvironmentTexture(three, a, 'studio')).toBe(first);
    expect(calls()).toBe(1);
    expect(getEnvironmentTexture(three, b, 'studio')).not.toBe(first);
    expect(calls()).toBe(2);

    disposeEnvironments(a);
    expect(generated[0].dispose).toHaveBeenCalledTimes(1);
    expect(generated[1].dispose).not.toHaveBeenCalled();
    expect(getEnvironmentTexture(three, a, 'studio')).not.toBe(first);
    expect(calls()).toBe(3);
  });

  test('a failure restores the renderer and is not retried every frame', () => {
    const {three, calls} = fakeThree(true);
    const renderer = fakeGlRenderer();
    expect(() => getEnvironmentTexture(three, renderer, 'studio')).toThrow(
      'context lost',
    );
    expect(renderer.getRenderTarget()).toBe(null);
    expect(renderer.autoClear).toBe(true);
    expect(() => getEnvironmentTexture(three, renderer, 'studio')).toThrow(
      'context lost',
    );
    expect(calls()).toBe(1);

    // A new renderer (or the same after a dispose) tries again.
    disposeEnvironments(renderer);
    expect(() => getEnvironmentTexture(three, renderer, 'studio')).toThrow();
    expect(calls()).toBe(2);
  });
});

describe('Light3D shadowFar', () => {
  function cameraOf(light: Light3D): THREE.OrthographicCamera {
    return (light.object3D().children[0] as THREE.DirectionalLight).shadow
      .camera;
  }

  test('defaults to the wide 20000 px range', () => {
    expect(cameraOf(new Light3D({castShadow: true})).far).toBe(200);
  });

  test('tightens the shadow camera to the given range in pixels', () => {
    expect(cameraOf(new Light3D({castShadow: true, shadowFar: 3200})).far).toBe(
      32,
    );
  });
});

describe('shared renderer', () => {
  function shared(): FakeWebGLRenderer {
    return getSharedRenderer(FAKE_THREE) as unknown as FakeWebGLRenderer;
  }

  test('is created once and shared', () => {
    disposeSharedRenderer();
    expect(shared()).toBe(shared());
  });

  test('is rebuilt after its WebGL context was lost', () => {
    disposeSharedRenderer();
    const logs = captureLogs(SCENE);
    const losses = getContextLossCount();
    const first = shared();
    first.loseContext();
    expect(getContextLossCount()).toBe(losses + 1);

    const second = shared();
    expect(second).not.toBe(first);
    expect(first.disposed).toBe(true);
    expect(logs.warnings).toHaveLength(1);
    expect(logs.warnings[0].message).toContain('WebGL context lost');
    expect(shared()).toBe(second);
  });

  test('ignores the context loss caused by its own disposal', () => {
    disposeSharedRenderer();
    const losses = getContextLossCount();
    const first = shared();
    disposeSharedRenderer();
    expect(first.disposed).toBe(true);
    expect(getContextLossCount()).toBe(losses);
  });

  test('ignores a loss on a renderer that was already replaced', () => {
    disposeSharedRenderer();
    const first = shared();
    disposeSharedRenderer();
    const second = shared();
    const losses = getContextLossCount();
    first.loseContext();
    expect(getContextLossCount()).toBe(losses);
    expect(shared()).toBe(second);
  });

  test('antialias is a context attribute: changing it rebuilds', () => {
    disposeSharedRenderer();
    expect(getRendererAntialias()).toBe(true);
    const first = shared();
    expect(first.antialias).toBe(true);

    setRendererAntialias(false);
    expect(first.disposed).toBe(true);
    expect(Three.antialias).toBe(false);
    const second = shared();
    expect(second.antialias).toBe(false);

    Three.antialias = true;
    expect(second.disposed).toBe(true);
    expect(shared().antialias).toBe(true);
    disposeSharedRenderer();
  });
});
