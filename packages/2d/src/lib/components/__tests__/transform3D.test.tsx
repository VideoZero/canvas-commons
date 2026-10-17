import {BBox, waitFor} from '@canvas-commons/core';
import {afterEach, describe, expect, it, vi} from 'vitest';
import {useScene2D} from '../../scenes';
import {Layout} from '../Layout';
import {Rect} from '../Rect';
import {Transform3D, Transform3DProps} from '../Transform3D';
import {generatorTest} from './generatorTest';
import {mockScene2D} from './mockScene2D';

class TestTransform3D extends Transform3D {
  public constructor(props?: Transform3DProps) {
    super(props);
  }

  public slices() {
    return this.depthSliceCount();
  }

  public slice(z = 0) {
    return this.sliceMatrix(z);
  }

  public drawInto(context: CanvasRenderingContext2D) {
    this.draw(context);
  }
}

function project(matrix: DOMMatrix, x: number, y: number) {
  const w = matrix.m14 * x + matrix.m24 * y + matrix.m44;
  return {
    x: (matrix.m11 * x + matrix.m21 * y + matrix.m41) / w,
    y: (matrix.m12 * x + matrix.m22 * y + matrix.m42) / w,
  };
}

function expectBBox(actual: BBox, expected: BBox) {
  expect(actual.x).toBeCloseTo(expected.x);
  expect(actual.y).toBeCloseTo(expected.y);
  expect(actual.width).toBeCloseTo(expected.width);
  expect(actual.height).toBeCloseTo(expected.height);
}

describe('Transform3D', () => {
  mockScene2D();

  afterEach(() => vi.restoreAllMocks());

  it('includes the render margin in the cache bounds', () => {
    const node = new Transform3D({
      children: <Rect size={100} position={[50, 0]} />,
    });
    useScene2D().getView().add(node);

    expectBBox(node.cacheBBox(), new BBox(-200, -250, 500, 500));
  });

  it('uses a custom render margin', () => {
    const node = new Transform3D({
      renderMargin: 10,
      children: <Rect width={100} height={40} />,
    });
    useScene2D().getView().add(node);

    expectBBox(node.cacheBBox(), new BBox(-60, -30, 120, 60));
  });

  it('covers at least the view with a frame render margin', () => {
    const node = new Transform3D({
      renderMargin: 'frame',
      children: <Rect size={100} position={[300, 0]} />,
    });
    useScene2D().getView().add(node);

    expectBBox(node.cacheBBox(), new BBox(300 - 960, -540, 1920, 1080));
  });

  it('follows the children when they move', () => {
    const rect = new Rect({size: 100});
    const node = new Transform3D({renderMargin: 0, children: rect});
    useScene2D().getView().add(node);

    rect.position([200, 100]);

    expectBBox(node.cacheBBox(), new BBox(150, 50, 100, 100));
  });

  it('wraps a laid-out subtree', () => {
    const node = new Transform3D({
      renderMargin: 0,
      children: (
        <Layout layout direction={'row'} anchor={[-1, 0]}>
          <Rect size={100} />
          <Rect size={100} />
        </Layout>
      ),
    });
    useScene2D().getView().add(node);

    expectBBox(node.cacheBBox(), new BBox(0, -50, 200, 100));
  });

  it('is the identity in its neutral pose', () => {
    const node = new TestTransform3D({perspective: 800});

    expect(project(node.slice(), 120, -40)).toEqual({x: 120, y: -40});
  });

  it('rotates about the transform origin', () => {
    const node = new TestTransform3D({
      rotationY: 180,
      transformOrigin: [-50, 0],
    });

    const hinge = project(node.slice(), -50, 0);
    const opposite = project(node.slice(), 50, 0);
    expect(hinge.x).toBeCloseTo(-50);
    expect(opposite.x).toBeCloseTo(-150);
  });

  it('foreshortens content moved toward the camera', () => {
    const node = new TestTransform3D({perspective: 1000, translateZ: 100});

    expect(project(node.slice(100), 100, 0).x).toBeCloseTo(100 / 0.9);
    expect(project(node.slice(0), 100, 0).x).toBeCloseTo(100);
  });

  it('keeps an extruded slab from being drawn edge-on', () => {
    const node = new TestTransform3D({depth: 10, rotationY: 89});

    expect(project(node.slice(), 100, 0).x).toBeCloseTo(
      100 * Math.cos((86 * Math.PI) / 180),
    );
    expect(node.rotationY()).toBe(89);

    node.rotationY(92);
    expect(project(node.slice(), 100, 0).x).toBeCloseTo(
      100 * Math.cos((94 * Math.PI) / 180),
    );
  });

  it('lets a flat sheet disappear edge-on', () => {
    const node = new TestTransform3D({rotationY: 90});

    expect(project(node.slice(), 100, 0).x).toBeCloseTo(0);
  });

  it('derives the slice count from the depth', () => {
    const node = new TestTransform3D();
    expect(node.slices()).toBe(0);

    node.depth(20);
    expect(node.slices()).toBe(10);

    node.depth(400);
    expect(node.slices()).toBe(64);

    node.depthSteps(1000);
    expect(node.slices()).toBe(512);
  });

  it('draws the children directly without WebGL', () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    const rect = new Rect({size: 100});
    const render = vi.spyOn(rect, 'render').mockImplementation(() => {});
    const node = new TestTransform3D({rotationY: 30, children: rect});
    useScene2D().getView().add(node);

    const context = {} as CanvasRenderingContext2D;
    node.drawInto(context);

    expect(render).toHaveBeenCalledWith(context);
  });

  it(
    'resets the pose but keeps the camera',
    generatorTest(function* () {
      const node = new Transform3D({
        rotationX: 10,
        rotationY: 20,
        rotationZ: 30,
        translateZ: 40,
        perspective: 900,
        transformOrigin: [10, 0],
      });

      yield* node.reset(0.5);
      yield* waitFor(0);

      expect(node.rotationX()).toBe(0);
      expect(node.rotationY()).toBe(0);
      expect(node.rotationZ()).toBe(0);
      expect(node.translateZ()).toBe(0);
      expect(node.perspective()).toBe(900);
      expect(node.transformOrigin().x).toBe(10);
    }),
  );
});
