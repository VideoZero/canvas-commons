import {BBox, Vector2, linear} from '@canvas-commons/core';
import 'geometry-polyfill';
import {describe, expect, it} from 'vitest';
import {useScene2D} from '../../scenes';
import {Camera} from '../Camera';
import {Line} from '../Line';
import {Rect} from '../Rect';
import {generatorTest} from './generatorTest';
import {mockScene2D} from './mockScene2D';

class CachedRect extends Rect {
  public override requiresCache(): boolean {
    return true;
  }

  public cacheRect(): BBox {
    return this.worldSpaceCacheBBox();
  }
}

describe('Camera transforms', () => {
  mockScene2D();

  it(
    'follows a curve inside its scene in scene coordinates',
    generatorTest(function* (view) {
      const line = new Line({
        points: [
          [0, 0],
          [400, 200],
        ],
      });
      const camera = new Camera({children: line});
      view.add(camera);

      yield* camera.followCurve(line, 1, linear);

      expect(camera.position().x).toBeCloseTo(400, 3);
      expect(camera.position().y).toBeCloseTo(200, 3);
    }),
  );

  it(
    'follows a curve with rotation inside its scene',
    generatorTest(function* (view) {
      const line = new Line({
        points: [
          [0, 0],
          [400, 0],
        ],
      });
      const camera = new Camera({zoom: 2, children: line});
      view.add(camera);

      yield* camera.followCurveWithRotation(line, 1, linear);

      expect(camera.position().x).toBeCloseTo(400, 3);
      expect(camera.position().y).toBeCloseTo(0, 3);
    }),
  );

  it('rasterizes cached nodes at the zoomed on-screen size', () => {
    const view = useScene2D().getView();
    const child = new CachedRect({size: 100});
    const camera = new Camera({zoom: 2, children: child});
    view.add(camera);

    const rect = child.cacheRect();
    const center = new Vector2(0, 0).transformAsPoint(view.localToWorld());
    expect(rect.width).toBeGreaterThanOrEqual(200);
    expect(rect.width).toBeLessThan(210);
    expect(Math.abs(rect.center.x - center.x)).toBeLessThan(2);
    expect(Math.abs(rect.center.y - center.y)).toBeLessThan(2);
  });
});
