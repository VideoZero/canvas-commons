import {describe, expect, test} from 'vitest';
import {plantedFootAt, walkBody} from '../characters';

const Options = {startX: 0, groundY: 300, stride: 100, lift: 20, duty: 0.5};

describe('plantedFootAt', () => {
  test('pins the foot to the ground during stance', () => {
    const first = plantedFootAt(0, Options);
    for (const cycle of [0.1, 0.2, 0.3, 0.49]) {
      const foot = plantedFootAt(cycle, Options);
      expect(foot.x).toBe(first.x);
      expect(foot.y).toBe(300);
    }
  });

  test('lifts the foot during swing', () => {
    expect(plantedFootAt(0.75, Options).y).toBeCloseTo(280);
  });

  test('lands exactly where the next stance begins', () => {
    const landing = plantedFootAt(0.999999, Options);
    const nextStance = plantedFootAt(1, Options);
    expect(landing.x).toBeCloseTo(nextStance.x, 3);
    expect(landing.y).toBeCloseTo(nextStance.y, 3);
  });
});

describe('walkBody', () => {
  test('advances at a constant speed', () => {
    const body = {startX: 10, speed: 50, groundY: 300, stand: 100, period: 1};
    expect(walkBody(2, body).x).toBe(110);
    expect(walkBody(0, body).y).toBeCloseTo(200 + 3, 5);
  });
});
