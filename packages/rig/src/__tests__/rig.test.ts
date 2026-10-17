import {Vector2} from '@canvas-commons/core';
import {describe, expect, test} from 'vitest';
import {BIPED} from '../gaits';
import {Rig, poseFK, solveChain} from '../skeleton';
import {StickFigure} from './fixtures';
import {mockScene2D} from './mockScene2D';

describe('Rig', () => {
  mockScene2D();

  test('starts in the rest pose relative to the root', () => {
    const rig = new Rig(StickFigure, BIPED, {scale: 2});
    expect(rig.get('neck').equals(new Vector2(0, -200))).toBe(true);
    expect(rig.boneLength('leftHip', 'leftKnee')).toBe(120);
    expect(rig.get('unknown').equals(Vector2.zero)).toBe(true);
  });

  test('draws one node per bone', () => {
    const rig = new Rig(StickFigure, BIPED);
    expect(rig.node.children().length).toBe(BIPED.bones.length);
  });

  test('poses with forward kinematics', () => {
    const rig = new Rig(StickFigure, BIPED);
    poseFK(rig, new Vector2(100, 0), {leftHip: 90});
    expect(rig.get('root').equals(new Vector2(100, 0))).toBe(true);
    const shin = rig.get('leftAnkle').sub(rig.get('leftKnee'));
    expect(shin.x).toBeCloseTo(-60);
    expect(shin.y).toBeCloseTo(0);
  });

  test('solves a chain with inverse kinematics', () => {
    const rig = new Rig(StickFigure, BIPED);
    const target = new Vector2(10, 100);
    solveChain(rig, BIPED.chains[0], target);
    expect(rig.get('leftAnkle').sub(target).magnitude).toBeLessThan(0.05);
  });
});
