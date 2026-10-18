import {Vector2} from '@canvas-commons/core';
import {beforeAll, describe, expect, test} from 'vitest';
import {ArcSegment} from './ArcSegment';

beforeAll(() => {
  Object.assign(SVGElement.prototype, {
    getTotalLength: () => 0,
    getBBox: () => ({x: 0, y: 0, width: 0, height: 0}),
  });
});

describe('ArcSegment', () => {
  test('scales a radius that is too small to reach the end point', () => {
    const radius = new Vector2(10, 10);
    const arc = new ArcSegment(
      new Vector2(0, 0),
      radius,
      0,
      0,
      1,
      new Vector2(100, 0),
    );

    expect(arc.radius.x).toBeCloseTo(50);
    expect(arc.radius.y).toBeCloseTo(50);
    expect(radius).toEqual(new Vector2(10, 10));

    const middle = arc.getPoint(0.5).position;
    expect(middle.x).toBeCloseTo(50);
    expect(Math.abs(middle.y)).toBeCloseTo(50);

    for (const t of [0.25, 0.75]) {
      const point = arc.getPoint(t).position;
      expect(point.sub(arc.center).magnitude).toBeCloseTo(50);
    }
  });

  test('draws the scaled ellipse', () => {
    const arc = new ArcSegment(
      new Vector2(0, 0),
      new Vector2(10, 20),
      0,
      0,
      1,
      new Vector2(100, 0),
    );
    const calls: number[][] = [];
    const context = {
      moveTo: () => undefined,
      ellipse: (...args: number[]) => calls.push(args),
    } as unknown as CanvasRenderingContext2D;

    arc.draw(context, 0, 0.5, true);

    expect(calls).toHaveLength(1);
    expect(calls[0][2]).toBeCloseTo(arc.radius.x);
    expect(calls[0][3]).toBeCloseTo(arc.radius.y);
    expect(arc.radius.x).toBeCloseTo(50);
    expect(arc.radius.y).toBeCloseTo(100);
    expect(arc.toSVGCommands()).toMatch(/^A 50(\.0+\d*)? 100/);
  });

  test('keeps a radius that is large enough', () => {
    const arc = new ArcSegment(
      new Vector2(0, 0),
      new Vector2(-80, 80),
      0,
      0,
      1,
      new Vector2(100, 0),
    );

    expect(arc.radius).toEqual(new Vector2(80, 80));
    expect(arc.getPoint(0.5).position.sub(arc.center).magnitude).toBeCloseTo(
      80,
    );
  });
});
