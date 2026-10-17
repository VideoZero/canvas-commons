import {BBox, Vector2, linear} from '@canvas-commons/core';
import 'geometry-polyfill';
import {describe, expect, it} from 'vitest';
import {useScene2D} from '../../scenes';
import {Camera} from '../Camera';
import {Line} from '../Line';
import {Node} from '../Node';
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

function fakeContext(): CanvasRenderingContext2D {
  return new Proxy(
    {},
    {
      get: (target: Record<string, unknown>, property: string) =>
        property in target ? target[property] : () => undefined,
      set: (target: Record<string, unknown>, property: string, value) => {
        target[property] = value;
        return true;
      },
    },
  ) as unknown as CanvasRenderingContext2D;
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

  it('places a shared scene in the space of the camera drawing it', () => {
    const view = useScene2D().getView();
    const scene = new Node({});
    const child = new Rect({size: 100});
    scene.add(child);
    const left = new Camera({scene, position: [-200, 0]});
    const right = new Camera({scene, position: [200, 0]});
    view.add([left, right]);
    const center = new Vector2(0, 0).transformAsPoint(view.localToWorld());

    left.render(fakeContext());
    const leftWorld = new Vector2(0, 0).transformAsPoint(child.localToWorld());
    right.render(fakeContext());
    const rightWorld = new Vector2(0, 0).transformAsPoint(child.localToWorld());

    expect(leftWorld.x).toBeCloseTo(center.x + 200, 3);
    expect(rightWorld.x).toBeCloseTo(center.x - 200, 3);
  });
});
