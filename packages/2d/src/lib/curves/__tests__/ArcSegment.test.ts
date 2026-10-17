import {BBox, Vector2} from '@canvas-commons/core';
import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {ArcSegment} from '../ArcSegment';

function sampledBBox(segment: ArcSegment) {
  const points: Vector2[] = [];
  for (let i = 0; i <= 2000; i++) {
    points.push(segment.getPoint(i / 2000).position);
  }
  return BBox.fromPoints(...points);
}

// jsdom can measure neither the length nor the box of a path, like Safari can
// fail to measure the box of one that is not rendered.
describe('ArcSegment', () => {
  const prototype = window.SVGElement.prototype;
  beforeAll(() => {
    Object.defineProperty(prototype, 'getTotalLength', {
      configurable: true,
      value: () => 0,
    });
  });
  afterAll(() => {
    Reflect.deleteProperty(prototype, 'getTotalLength');
  });

  type Pair = [number, number];
  it.each<[string, Pair, Pair, number, number, number, Pair]>([
    ['a half circle', [-1, 0], [1, 1], 0, 0, 1, [1, 0]],
    ['a quarter circle', [0, -10], [10, 10], 0, 0, 1, [10, 0]],
    ['a large arc', [0, -10], [10, 10], 0, 1, 0, [10, 0]],
    ['a rotated ellipse', [3, 1], [4, 2], 30, 1, 1, [1, 2]],
  ])(
    'bounds %s without measuring it',
    (_, start, radius, rotation, large, sweep, end) => {
      const segment = new ArcSegment(
        new Vector2(start),
        new Vector2(radius),
        rotation,
        large,
        sweep,
        new Vector2(end),
      );
      const [topLeft, bottomRight] = segment.points;
      const expected = sampledBBox(segment);

      expect(topLeft.x).toBeCloseTo(expected.left, 3);
      expect(topLeft.y).toBeCloseTo(expected.top, 3);
      expect(bottomRight.x).toBeCloseTo(expected.right, 3);
      expect(bottomRight.y).toBeCloseTo(expected.bottom, 3);
    },
  );
});
