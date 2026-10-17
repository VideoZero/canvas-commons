import {Vector2} from '@canvas-commons/core';
import {describe, expect, it} from 'vitest';
import {useScene2D} from '../../scenes';
import {Line, LineProps} from '../Line';
import {Node} from '../Node';
import {Rect} from '../Rect';
import {mockScene2D} from './mockScene2D';

function inView(node: Node) {
  return node
    .absolutePosition()
    .transformAsPoint(useScene2D().getView().worldToLocal());
}

function expectVector(actual: Vector2, x: number, y: number) {
  expect(actual.x).toBeCloseTo(x);
  expect(actual.y).toBeCloseTo(y);
}

function line(points: [number, number][], props: Partial<LineProps> = {}) {
  const child = new Rect({size: 10, position: [10, 0]});
  const curve = new Line({
    points,
    alignChildren: true,
    position: [50, 0],
    ...props,
    children: [child],
  });
  useScene2D().getView().add(curve);
  return {curve, child};
}

describe('Curve.alignChildren', () => {
  mockScene2D();

  it('leaves the children in the local space by default', () => {
    const {child} = line(
      [
        [0, 0],
        [0, 200],
      ],
      {alignChildren: false},
    );

    expectVector(inView(child), 60, 0);
  });

  it('places the children at the midpoint along the tangent', () => {
    const {child} = line([
      [0, 0],
      [0, 200],
    ]);

    expectVector(inView(child), 50, 110);
    expect(child.absoluteRotation()).toBeCloseTo(90);
  });

  it('keeps the children upright without rotateChildren', () => {
    const {child} = line(
      [
        [0, 0],
        [0, 200],
      ],
      {rotateChildren: false},
    );

    expectVector(inView(child), 60, 100);
    expect(child.absoluteRotation()).toBeCloseTo(0);
  });

  it('converts absolute positions into the aligned space', () => {
    const {child} = line([
      [0, 0],
      [0, 200],
    ]);

    child.absolutePosition(
      Vector2.zero.transformAsPoint(useScene2D().getView().localToWorld()),
    );

    expectVector(child.position(), -100, 50);
    expectVector(inView(child), 0, 0);
  });

  it('includes the aligned children in the bounding box and hit test', () => {
    const {curve, child} = line([
      [0, 0],
      [200, 0],
    ]);
    child.position([0, 100]);

    expect(curve.cacheBBox().bottom).toBeCloseTo(105);
    expect(curve.hit(new Vector2(150, 100))).toBe(child);
  });

  it('counters the tangent in steps of 90 degrees', () => {
    expect(
      line([
        [0, 0],
        [200, 20],
      ]).curve.uprightRotation(),
    ).toBeCloseTo(0);
    expect(
      line([
        [0, 0],
        [-200, 20],
      ]).curve.uprightRotation(),
    ).toBeCloseTo(-180);
    expect(
      line(
        [
          [0, 0],
          [-200, 20],
        ],
        {rotateChildren: false},
      ).curve.uprightRotation(),
    ).toBe(0);
  });
});
