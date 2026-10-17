import {Layout, Node, Rect} from '@canvas-commons/2d';
import {
  ThreadGenerator,
  Vector2,
  all,
  cancel,
  linear,
  waitFor,
} from '@canvas-commons/core';
import {describe, expect, it} from 'vitest';
import {AnimLayout} from '../AnimLayout';
import {failOnSceneErrors, generatorTest, mockScene2D} from './mockScene2D';

function expectVec(actual: Vector2, expected: Vector2, digits = 3) {
  expect(actual.x).toBeCloseTo(expected.x, digits);
  expect(actual.y).toBeCloseTo(expected.y, digits);
}

/** Where the node's origin is drawn, including `translate`. */
function visual(node: Node) {
  return Vector2.zero.transformAsPoint(node.localToWorld());
}

/** Check that `p` lies strictly between `a` and `b` on a straight line. */
function onSegment(p: Vector2, a: Vector2, b: Vector2) {
  const ab = b.sub(a);
  const ap = p.sub(a);
  const cross = ab.x * ap.y - ab.y * ap.x;
  expect(Math.abs(cross)).toBeLessThan(1e-3 * Math.max(1, ab.magnitude));
  const t = ab.dot(ap) / ab.dot(ab);
  expect(t).toBeGreaterThan(0);
  expect(t).toBeLessThan(1);
}

/** Run `animation`, and `probe` once `at` seconds of it have passed. */
function* probeAt(
  animation: ThreadGenerator,
  at: number,
  probe: () => void,
): ThreadGenerator {
  yield* all(
    animation,
    (function* () {
      yield* waitFor(at);
      probe();
    })(),
  );
}

function row(view: Node, children: Node[], width = 400) {
  const list = new AnimLayout({
    layout: true,
    direction: 'row',
    width,
    height: 100,
    gap: 10,
    children,
  });
  view.add(list);
  return list;
}

function createBox() {
  return new Rect({width: 50, height: 50});
}

describe('AnimLayout', () => {
  mockScene2D();
  failOnSceneErrors();

  it(
    'adds, inserts, removes and reorders children animated',
    generatorTest(function* (view) {
      const [a, b, c] = [createBox(), createBox(), createBox()];
      const list = row(view, [a]);
      yield* list.addAnimated(b, 0.3);
      expect(list.children()).toEqual([a, b]);
      yield* list.insertAnimated(c, 0, 0.3);
      expect(list.children()).toEqual([c, a, b]);

      const before = visual(a);
      let middle = Vector2.zero;
      yield* probeAt(list.reorderAnimated([a, b, c], 1, linear), 0.5, () => {
        middle = visual(a);
      });
      expect(list.children()).toEqual([a, b, c]);
      const after = visual(a);
      expect(after.x).toBeLessThan(before.x);
      expect(middle.x).toBeLessThan(before.x);
      expect(middle.x).toBeGreaterThan(after.x);

      yield* list.removeAnimated(b, 0.3);
      expect(list.children()).toEqual([a, c]);
      expect(b.parent()).toBeNull();
      expect(view.children()).toEqual([list]);
    }),
  );

  it(
    'rejects a reorder that is not a permutation of the children',
    generatorTest(function* (view) {
      const [a, b] = [createBox(), createBox()];
      const list = row(view, [a, b]);
      expect(() => list.reorderAnimated([a], 1).next()).toThrow();
    }),
  );

  it(
    'locks and releases the size of a node',
    generatorTest(function* (view) {
      const item = new AnimLayout({grow: 1, height: 100});
      const list = row(view, [item], 300);
      expect(item.size.x()).toBe(300);
      item.lockSize();
      item.releaseSize();
      list.width(200);
      expect(item.size.x()).toBe(200);
    }),
  );

  it(
    'records the size and world position of the whole layout tree',
    generatorTest(function* (view) {
      const inner = new AnimLayout({width: 50, height: 50});
      const list = row(view, [inner]);
      const state = inner.recordFlipState();
      expect([...state.keys()]).toEqual([list, inner]);
      expect(inner.layoutRoot()).toBe(list);
      expectVec(
        state.get(inner)?.computedSize ?? Vector2.zero,
        new Vector2(50),
      );
      expectVec(
        state.get(inner)?.absolutePosition ?? Vector2.zero,
        inner.position.abs(),
      );
      expect([...inner.recordFlipState(false).keys()]).toEqual([inner]);
    }),
  );

  it(
    'animates any layout change between record and tween',
    generatorTest(function* (view) {
      const a = new AnimLayout({width: 50, height: 50});
      const b = new AnimLayout({width: 50, height: 50});
      const list = row(view, [a, b]);
      const from = b.position.abs();
      const width = b.width.context.raw();
      const before = list.recordFlipState();
      list.gap(110);
      const to = b.position.abs();
      expect(to.x - from.x).toBeCloseTo(100, 3);

      yield* probeAt(list.tweenFlip(before, 1, linear), 0.5, () => {
        expectVec(visual(b), Vector2.lerp(from, to, 0.5), 1);
      });
      expectVec(visual(b), to);
      expectVec(b.translate(), Vector2.zero);
      expect(b.width.context.raw()).toBe(width);
    }),
  );

  // VZ ff6bda6d: basis-0 items collapsed to 0 width while their size was
  // tweened.
  it(
    'keeps basis-0 items sized during the tween',
    generatorTest(function* (view) {
      const a = new AnimLayout({basis: 0, grow: 1, height: 100});
      const b = new AnimLayout({basis: 0, grow: 1, height: 100});
      const list = row(view, [a, b], 300);
      list.gap(0);
      expect(a.size.x()).toBe(150);
      const width = a.width.context.raw();
      const before = list.recordFlipState();
      list.width(600);
      yield* probeAt(list.tweenFlip(before, 1, linear), 0.5, () => {
        expect(a.size.x()).toBeCloseTo(225, 1);
        expect(b.size.x()).toBeCloseTo(225, 1);
      });
      expect(a.size.x()).toBe(300);
      expect(a.width.context.raw()).toBe(width);
    }),
  );

  // VZ ec19ce66: nodes moved to another parent animated between unrelated
  // parent-local positions.
  it(
    'animates a reparented node in world space',
    generatorTest(function* (view) {
      const item = new AnimLayout({width: 50, height: 50});
      const left = row(view, [item], 200);
      left.position([-300, 0]);
      const right = row(view, [], 200);
      right.position([300, 200]);
      const root = new AnimLayout({});
      view.add(root);
      root.add([left, right]);
      left.layout(false);
      right.layout(false);

      const before = left.recordFlipState(false);
      const from = item.position.abs();
      right.add(item);
      const to = item.position.abs();
      expect(to.x).toBeGreaterThan(from.x);

      yield* probeAt(right.tweenFlip(before, 1, linear), 0.5, () => {
        expectVec(visual(item), Vector2.lerp(from, to, 0.5), 1);
      });
      expectVec(visual(item), to);
    }),
  );

  it(
    'moves along a straight line under a rotated ancestor',
    generatorTest(function* (view) {
      const a = new AnimLayout({width: 50, height: 50});
      const b = new AnimLayout({width: 50, height: 50});
      const list = row(view, [a, b]);
      list.direction('column');
      list.height(400);
      const holder = new Node({rotation: 30, scale: [1, 2]});
      view.add(holder);
      holder.add(list);

      const before = list.recordFlipState();
      const from = b.position.abs();
      list.direction('row');
      list.alignItems('end');
      const to = b.position.abs();
      expect(from.sub(to).magnitude).toBeGreaterThan(10);

      yield* probeAt(list.tweenFlip(before, 1, linear), 0.4, () => {
        onSegment(visual(b), from, to);
      });
      expectVec(visual(b), to);
    }),
  );

  it(
    'puts every node in its place when the tween is canceled',
    generatorTest(function* (view) {
      const a = new AnimLayout({grow: 1, height: 50});
      const b = new AnimLayout({width: 50, height: 50, translate: [0, 5]});
      const list = row(view, [a, b], 300);
      const width = a.width.context.raw();
      const before = list.recordFlipState();
      list.gap(50);
      const task = list.tweenFlip(before, 1);
      yield task;
      yield* waitFor(0.5);
      cancel(task);
      expectVec(b.translate(), new Vector2(0, 5));
      expect(a.width.context.raw()).toBe(width);
      // The lock is released: `a` grows into the space again.
      list.width(500);
      expect(a.size.x()).toBe(400);
      expectVec(visual(b), b.position.abs().addY(5));
    }),
  );

  it(
    'jumps nodes that were not recorded',
    generatorTest(function* (view) {
      const list = row(view, []);
      const before = list.recordFlipState();
      const a = new AnimLayout({width: 50, height: 50});
      list.add(a);
      yield* probeAt(list.tweenFlip(before, 1), 0.5, () => {
        expectVec(visual(a), a.position.abs());
      });
    }),
  );
});

describe('AnimLayout (non-layout children)', () => {
  mockScene2D();

  it(
    'inserts plain nodes into a layout',
    generatorTest(function* (view) {
      const list = row(view, []);
      const plain = new Layout({width: 20, height: 20});
      yield* list.addAnimated([plain], 0.2);
      expect(list.children()).toEqual([plain]);
    }),
  );
});
