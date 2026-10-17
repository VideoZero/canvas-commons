import {Vector2} from '@canvas-commons/core';
import {describe, expect, test} from 'vitest';
import {fabrik} from '../ik';

const Lengths = [60, 60];
const Seed = [new Vector2(0, 0), new Vector2(10, 60), new Vector2(0, 120)];

describe('fabrik', () => {
  test('reaches a target within reach and keeps bone Lengths', () => {
    const target = new Vector2(40, 90);
    const [base, middle, effector] = fabrik(
      Vector2.zero,
      target,
      Lengths,
      Seed,
    );
    expect(base.equals(Vector2.zero)).toBe(true);
    expect(effector.sub(target).magnitude).toBeLessThan(0.05);
    expect(middle.sub(base).magnitude).toBeCloseTo(60, 3);
    expect(effector.sub(middle).magnitude).toBeCloseTo(60, 3);
  });

  test('bends towards the Seed', () => {
    const [, middle] = fabrik(Vector2.zero, new Vector2(0, 100), Lengths, Seed);
    expect(middle.x).toBeGreaterThan(0);
  });

  test('stretches straight towards an unreachable target', () => {
    const points = fabrik(Vector2.zero, new Vector2(300, 0), Lengths, Seed);
    expect(points[1].x).toBeCloseTo(60);
    expect(points[2].x).toBeCloseTo(120);
    expect(points[2].y).toBeCloseTo(0);
  });
});
