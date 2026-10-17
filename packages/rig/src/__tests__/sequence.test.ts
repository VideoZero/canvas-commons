import {Vector2} from '@canvas-commons/core';
import {describe, expect, test} from 'vitest';
import {blendPoses, sequence, stateMachine} from '../characters';

function at(x: number) {
  return () => ({root: new Vector2(x, 0)});
}
function clock() {
  return (t: number) => ({root: new Vector2(t, 0)});
}

describe('blendPoses', () => {
  test('lerps shared joints and passes the rest through', () => {
    const blended = blendPoses(
      {a: new Vector2(0, 0), b: new Vector2(5, 5)},
      {a: new Vector2(10, 0), c: new Vector2(1, 1)},
      0.5,
    );
    expect(blended.a.x).toBe(5);
    expect(blended.b.x).toBe(5);
    expect(blended.c.x).toBe(1);
  });
});

describe('sequence', () => {
  test('evaluates clips in local time', () => {
    const pose = sequence([{clip: at(0), duration: 1}, {clip: clock()}]);
    expect(pose(0.5).root.x).toBe(0);
    expect(pose(1.25).root.x).toBe(0.25);
  });

  test('cross-fades into the next clip', () => {
    const pose = sequence([
      {clip: at(0), duration: 1},
      {clip: at(10), blend: 1},
    ]);
    expect(pose(1).root.x).toBe(0);
    expect(pose(1.5).root.x).toBeCloseTo(5);
    expect(pose(2).root.x).toBe(10);
  });
});

describe('stateMachine', () => {
  test('sequences named states', () => {
    const pose = stateMachine({idle: at(0), walk: at(10)})
      .to('idle', {duration: 1})
      .to('walk')
      .build();
    expect(pose(0.5).root.x).toBe(0);
    expect(pose(3).root.x).toBe(10);
  });

  test('rejects unknown states', () => {
    expect(() => stateMachine({}).to('run')).toThrow("unknown state 'run'");
  });
});
