import * as THREE from 'three';
import {describe, expect, test} from 'vitest';
import {Three} from '../ThreeNode';
import {configureThree} from '../loader';
import {
  disposeSharedRenderer,
  getContextLossCount,
  getRendererAntialias,
  getSharedRenderer,
  setRendererAntialias,
} from '../renderer';
import {FAKE_THREE, FakeWebGLRenderer} from './fakes';
import {captureLogs, mockScene} from './mockScene';

const SCENE = mockScene();
configureThree({module: THREE});

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
