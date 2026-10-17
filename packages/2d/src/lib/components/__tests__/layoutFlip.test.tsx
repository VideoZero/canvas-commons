import {
  ThreadGenerator,
  Vector2,
  cancel,
  createRef,
  waitFor,
} from '@canvas-commons/core';
import {describe, expect, it} from 'vitest';
import {useScene2D} from '../../scenes';
import {Layout} from '../Layout';
import {Node} from '../Node';
import {Rect} from '../Rect';
import {generatorTest} from './generatorTest';
import {mockScene2D} from './mockScene2D';

function expectVec(actual: Vector2, expected: Vector2, digits = 3) {
  expect(actual.x).toBeCloseTo(expected.x, digits);
  expect(actual.y).toBeCloseTo(expected.y, digits);
}

/** Where the node's origin is drawn, including `translate`. */
function visual(node: Node) {
  return Vector2.zero.transformAsPoint(node.localToWorld());
}

function onSegment(p: Vector2, a: Vector2, b: Vector2) {
  const ab = b.sub(a);
  const ap = p.sub(a);
  const cross = ab.x * ap.y - ab.y * ap.x;
  expect(Math.abs(cross)).toBeLessThan(1e-3 * Math.max(1, ab.magnitude));
  const t = ab.dot(ap) / ab.dot(ab);
  expect(t).toBeGreaterThan(0);
  expect(t).toBeLessThan(1);
}

describe('Layout FLIP edge cases', () => {
  mockScene2D();

  describe('flex-basis 0', () => {
    it(
      'keeps a basis-0 container sized while its layout is edited',
      generatorTest(function* () {
        const inner = createRef<Layout>();
        useScene2D()
          .getView()
          .add(
            <Layout layout direction="row" width={400} height={100}>
              <Layout ref={inner} basis={0} grow={1} gap={10}>
                <Layout width={50} height={50} />
                <Layout width={50} height={50} />
              </Layout>
            </Layout>,
          );
        expect(inner().size.x()).toBe(400);

        const task = yield inner().editLayout(1, n => n.gap(20));
        yield* waitFor(0.5);
        expect(inner().size.x()).toBe(400);
        yield* task;
        expect(inner().size.x()).toBe(400);
      }),
    );

    it(
      'keeps basis-0 siblings sized while one is removed',
      generatorTest(function* () {
        const a = createRef<Layout>();
        const b = createRef<Layout>();
        useScene2D()
          .getView()
          .add(
            <Layout layout direction="row" width={300} height={100}>
              <Layout ref={a} basis={0} grow={1} height={100} />
              <Layout ref={b} basis={0} grow={1} height={100} />
            </Layout>,
          );
        expect(a().size.x()).toBe(150);

        const task = yield b().remove(1);
        yield* waitFor(0.5);
        expect(a().size.x()).toBeGreaterThan(150);
        expect(a().size.x()).toBeLessThan(300);
        yield* task;
        expect(a().size.x()).toBe(300);
      }),
    );

    it(
      'keeps basis-0 siblings sized while a node is added',
      generatorTest(function* () {
        const stack = createRef<Layout>();
        const a = createRef<Layout>();
        useScene2D()
          .getView()
          .add(
            <Layout ref={stack} layout direction="row" width={300} height={100}>
              <Layout ref={a} basis={0} grow={1} height={100} />
            </Layout>,
          );
        expect(a().size.x()).toBe(300);

        const task = yield stack().add(
          <Layout basis={0} grow={1} height={100} />,
          1,
        );
        yield* waitFor(0.5);
        expect(a().size.x()).toBeGreaterThan(150);
        expect(a().size.x()).toBeLessThan(300);
        yield* task;
        expect(a().size.x()).toBe(150);
      }),
    );
  });

  describe('growing siblings', () => {
    it(
      'tweens the size of a growing sibling while another is removed',
      generatorTest(function* () {
        const a = createRef<Layout>();
        const b = createRef<Layout>();
        useScene2D()
          .getView()
          .add(
            <Layout layout direction="row" width={300} height={100}>
              <Layout ref={a} grow={1} height={100} />
              <Layout ref={b} grow={1} height={100} />
            </Layout>,
          );
        expect(a().size.x()).toBe(150);

        const task = yield b().remove(1);
        expect(a().size.x()).toBeCloseTo(150, 0);
        yield* waitFor(0.5);
        expect(a().size.x()).toBeCloseTo(225, 0);
        yield* task;
        expect(a().size.x()).toBe(300);
        expect(a().width.context.raw()).toBeNull();
      }),
    );

    it(
      'tweens the size of a growing child on editLayout',
      generatorTest(function* () {
        const stack = createRef<Layout>();
        const a = createRef<Layout>();
        useScene2D()
          .getView()
          .add(
            <Layout ref={stack} layout direction="row" width={300} height={100}>
              <Layout ref={a} grow={1} height={100} />
            </Layout>,
          );

        const task = yield stack().editLayout(1, n => n.padding.left(100));
        yield* waitFor(0.5);
        expect(a().size.x()).toBeCloseTo(250, 0);
        yield* task;
        expect(a().size.x()).toBe(200);
      }),
    );
  });

  describe('transformed ancestors', () => {
    function* checkSiblingPath(
      outer: Node,
      stack: Layout,
      sibling: Layout,
      mutate: () => ThreadGenerator,
    ): ThreadGenerator {
      const pre = visual(sibling);
      const task = yield mutate();
      expectVec(visual(sibling), pre);
      yield* waitFor(0.5);
      const mid = visual(sibling);
      yield* task;
      const post = visual(sibling);
      expect(post.sub(pre).magnitude).toBeGreaterThan(1);
      onSegment(mid, pre, post);
      expect(outer.children()).toContain(stack);
    }

    function setup() {
      const outer = createRef<Node>();
      const stack = createRef<Layout>();
      const first = createRef<Rect>();
      const last = createRef<Rect>();
      useScene2D()
        .getView()
        .add(
          <Node ref={outer} rotation={30} scale={[2, 0.5]} position={[40, 10]}>
            <Layout ref={stack} layout direction="row" gap={10}>
              <Rect ref={first} width={100} height={100} />
              <Rect width={100} height={100} />
              <Rect ref={last} width={100} height={100} />
            </Layout>
          </Node>,
        );
      return {outer: outer(), stack: stack(), first: first(), last: last()};
    }

    it(
      'moves siblings along a straight world path on insert',
      generatorTest(function* () {
        const {outer, stack, last} = setup();
        yield* checkSiblingPath(outer, stack, last, () =>
          stack.insert(<Rect width={80} height={100} />, 1, 1),
        );
      }),
    );

    it(
      'moves siblings along a straight world path on remove',
      generatorTest(function* () {
        const {outer, stack, first, last} = setup();
        const middle = stack.children()[1] as Layout;
        yield* checkSiblingPath(outer, stack, last, () => middle.remove(1));
        expect(stack.children()).toEqual([first, last]);
      }),
    );

    it(
      'moves children along a straight world path on editLayout',
      generatorTest(function* () {
        const {outer, stack, last} = setup();
        yield* checkSiblingPath(outer, stack, last, () =>
          stack.editLayout(1, n => n.direction('column')),
        );
      }),
    );

    it(
      'moves children along a straight world path on thawLayout',
      generatorTest(function* () {
        const {outer, stack, last} = setup();
        stack.freezeLayout();
        stack.children()[1].remove();
        yield* checkSiblingPath(outer, stack, last, () => stack.thawLayout(1));
      }),
    );

    it(
      'thaws a rotated child along a straight world path',
      generatorTest(function* () {
        const {outer, stack, last} = setup();
        last.rotation(90);
        last.scale(2);
        stack.freezeLayout();
        stack.children()[1].remove();
        yield* checkSiblingPath(outer, stack, last, () => stack.thawLayout(1));
      }),
    );
  });

  describe('reparenting', () => {
    it(
      'moves a node between transformed parents via transitionTo',
      generatorTest(function* () {
        const from = createRef<Layout>();
        const to = createRef<Layout>();
        const item = createRef<Rect>();
        useScene2D()
          .getView()
          .add(
            <>
              <Node rotation={45} scale={2}>
                <Layout ref={from} layout direction="row" gap={10}>
                  <Rect width={50} height={50} />
                  <Rect ref={item} width={50} height={50} />
                </Layout>
              </Node>
              <Node position={[300, 200]} rotation={-20} scale={[0.5, 1.5]}>
                <Layout ref={to} layout direction="column" gap={10}>
                  <Rect width={50} height={50} />
                </Layout>
              </Node>
            </>,
          );

        const start = visual(item());
        const task = yield item().transitionTo(to(), 1);
        expectVec(visual(item()), start);
        yield* waitFor(0.5);
        const mid = visual(item());
        yield* task;
        const end = visual(item());
        expect(item().parent()).toBe(to());
        expect(to().children().length).toBe(2);
        expect(from().children().length).toBe(1);
        onSegment(mid, start, end);
      }),
    );
  });

  describe('cancellation', () => {
    function setup() {
      const stack = createRef<Layout>();
      const a = createRef<Layout>();
      const b = createRef<Layout>();
      useScene2D()
        .getView()
        .add(
          <Layout ref={stack} layout direction="row" width={300} height={100}>
            <Layout ref={a} grow={1} height={100} />
            <Layout ref={b} grow={1} height={100} />
          </Layout>,
        );
      return {stack: stack(), a: a(), b: b()};
    }

    function expectUnlocked(stack: Layout, ...nodes: Layout[]) {
      stack.width(400);
      const share = 400 / stack.children().length;
      for (const node of nodes) {
        expect(Math.abs(node.size.x() - share)).toBeLessThanOrEqual(1);
        expect(node.translate()).toEqual(Vector2.zero);
      }
      expect(stack.canLayoutChildren()).toBe(true);
    }

    it(
      'releases the lock when a size tween is canceled',
      generatorTest(function* () {
        const {stack, a, b} = setup();
        const task = yield a.size.x(100, 1);
        yield* waitFor(0.5);
        cancel(task);
        a.width.context.reset();
        expectUnlocked(stack, a, b);
      }),
    );

    it(
      'releases the lock when an animated insert is canceled',
      generatorTest(function* () {
        const {stack, a, b} = setup();
        const c = (<Layout grow={1} height={100} />) as Layout;
        const task = yield stack.add(c, 1);
        yield* waitFor(0.5);
        cancel(task);
        expect(stack.children()).toEqual([a, b, c]);
        expectUnlocked(stack, a, b, c);
      }),
    );

    it(
      'releases the lock when an animated remove is canceled',
      generatorTest(function* () {
        const {stack, a, b} = setup();
        const task = yield b.remove(1);
        yield* waitFor(0.5);
        cancel(task);
        expect(stack.children()).toEqual([a]);
        expect(b.parent()).toBeNull();
        expectUnlocked(stack, a);
      }),
    );

    it(
      'releases the lock when editLayout is canceled',
      generatorTest(function* () {
        const {stack, a, b} = setup();
        const task = yield stack.editLayout(1, n => n.gap(20));
        yield* waitFor(0.5);
        cancel(task);
        stack.gap(0);
        expectUnlocked(stack, a, b);
      }),
    );

    it(
      'restores translate when thawLayout is canceled',
      generatorTest(function* () {
        const {stack, a, b} = setup();
        stack.freezeLayout();
        a.position.x(-400);
        const task = yield stack.thawLayout(1);
        yield* waitFor(0.5);
        cancel(task);
        expectUnlocked(stack, a, b);
      }),
    );

    it(
      'restores the node when transitionTo is canceled',
      generatorTest(function* () {
        const {stack, a, b} = setup();
        const other = (
          <Layout layout direction="row" width={300} height={100} />
        ) as Layout;
        useScene2D().getView().add(other);
        const task = yield b.transitionTo(other, 1);
        yield* waitFor(0.5);
        cancel(task);
        expect(b.parent()).toBe(other);
        expect(b.isLayoutRoot()).toBe(false);
        expect(stack.children()).toEqual([a]);
        expectUnlocked(stack, a);
      }),
    );
  });

  describe('existing translate', () => {
    it(
      'preserves a user translate across thawLayout',
      generatorTest(function* () {
        const stack = createRef<Layout>();
        const a = createRef<Rect>();
        useScene2D()
          .getView()
          .add(
            <Layout ref={stack} layout direction="row" gap={10}>
              <Rect width={100} height={100} />
              <Rect ref={a} width={100} height={100} translate={[0, 30]} />
            </Layout>,
          );
        stack().freezeLayout();
        stack().children()[0].remove();
        const pre = visual(a());
        const task = yield stack().thawLayout(1);
        expectVec(visual(a()), pre);
        yield* task;
        expect(a().translate()).toEqual(new Vector2(0, 30));
      }),
    );
  });
});
