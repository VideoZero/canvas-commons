import {createSignal} from '@canvas-commons/core';
import {describe, expect, test} from 'vitest';
import {bindPose, biped, locomotion} from '../characters';
import {BIPED} from '../gaits';
import {Rig} from '../skeleton';
import {StickFigure} from './fixtures';
import {mockScene2D} from './mockScene2D';

describe('character animations', () => {
  mockScene2D();

  test('binds a deterministic pose to a clock', () => {
    const rig = new Rig(StickFigure, BIPED);
    const clock = createSignal(0);
    bindPose(rig, clock, biped.walk(rig, {groundY: 300}));
    clock(0.7);
    const forward = rig.get('leftKnee');
    clock(2.1);
    clock(0.7);
    expect(rig.get('leftKnee').equals(forward)).toBe(true);
  });

  test('keeps a planted foot still while walking', () => {
    const rig = new Rig(StickFigure, BIPED);
    const walk = biped.walk(rig, {groundY: 300, period: 1, duty: 0.5});
    const planted = walk(0.05).leftAnkle;
    const later = walk(0.4).leftAnkle;
    expect(later.x).toBeCloseTo(planted.x, 1);
    expect(later.y).toBeCloseTo(300, 1);
  });

  test('integrates locomotion deterministically', () => {
    const rig = new Rig(StickFigure, BIPED);
    const pose = locomotion(rig, {
      groundY: 300,
      speed: [
        {t: 0, speed: 0},
        {t: 1, speed: 120},
      ],
    });
    expect(pose(2).root.equals(pose(2).root)).toBe(true);
    expect(pose(2).root.x).toBeGreaterThan(pose(1).root.x);
    expect(locomotion(rig, {speed: []})(1).root.x).toBeCloseTo(0);
  });
});
