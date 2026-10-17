import {Vector2, createRef, waitFor} from '@canvas-commons/core';
import {describe, expect, it} from 'vitest';
import {useScene2D} from '../../scenes';
import {Layout} from '../Layout';
import {Node} from '../Node';
import {Rect} from '../Rect';
import {generatorTest} from './generatorTest';
import {mockScene2D} from './mockScene2D';

describe('Layout.reorder', () => {
  mockScene2D();

  function setup(wrap?: (stack: Node) => Node) {
    const stack = createRef<Layout>();
    const a = createRef<Rect>();
    const b = createRef<Rect>();
    const c = createRef<Rect>();
    const content = (
      <Layout ref={stack} layout direction="row" gap={10}>
        <Rect ref={a} width={100} height={100} />
        <Rect ref={b} width={50} height={100} />
        <Rect ref={c} width={150} height={100} />
      </Layout>
    ) as Layout;
    useScene2D()
      .getView()
      .add(wrap ? wrap(content) : content);
    return {stack: stack(), a: a(), b: b(), c: c()};
  }

  it('reorders children immediately without a duration', () => {
    const {stack, a, b, c} = setup();
    const result = stack.reorder([c, a, b]);
    expect(result).toBe(stack);
    expect(stack.children()).toEqual([c, a, b]);
    expect(c.position.x()).toBeLessThan(a.position.x());
    expect(a.position.x()).toBeLessThan(b.position.x());
  });

  it(
    'slides children from their old slots to the new ones',
    generatorTest(function* () {
      const {stack, a, b, c} = setup();
      const before = [a, b, c].map(n => n.absolutePosition());

      const task = yield stack.reorder([c, a, b], 1);
      expect(stack.children()).toEqual([c, a, b]);
      [a, b, c].forEach((n, i) => {
        expect(n.absolutePosition().x).toBeCloseTo(before[i].x);
      });

      yield* waitFor(0.5);
      const mid = [a, b, c].map(n => n.absolutePosition());

      yield* task;
      const after = [a, b, c].map(n => n.absolutePosition());
      expect(after[2].x).toBeLessThan(after[0].x);
      expect(after[0].x).toBeLessThan(after[1].x);
      [0, 1, 2].forEach(i => {
        expect(mid[i].x).toBeCloseTo((before[i].x + after[i].x) / 2, 0);
      });
      expect(stack.canLayoutChildren()).toBe(true);
    }),
  );

  it(
    'keeps the container size stable while reordering',
    generatorTest(function* () {
      const {stack, a, b, c} = setup();
      const size = new Vector2(stack.size());
      const task = yield stack.reorder([b, c, a], 1);
      yield* waitFor(0.5);
      expect(stack.size()).toEqual(size);
      yield* task;
      expect(stack.size()).toEqual(size);
    }),
  );

  it(
    'animates inside rotated and scaled ancestors',
    generatorTest(function* () {
      const {stack, a, c} = setup(
        content =>
          (
            <Node rotation={30} scale={[2, 0.5]}>
              {content}
            </Node>
          ) as Node,
      );
      const start = a.absolutePosition();
      const task = yield stack.reorder([c, stack.children()[1], a], 1);
      expect(a.absolutePosition().x).toBeCloseTo(start.x);
      expect(a.absolutePosition().y).toBeCloseTo(start.y);
      yield* waitFor(0.5);
      const mid = a.absolutePosition();
      yield* task;
      const end = a.absolutePosition();
      expect(mid.x).toBeCloseTo((start.x + end.x) / 2, 0);
      expect(mid.y).toBeCloseTo((start.y + end.y) / 2, 0);
    }),
  );

  it('rejects an order that is not a permutation of the children', () => {
    const {stack, a, b, c} = setup();
    const stranger = new Rect({});
    expect(() => stack.reorder([a, b])).toThrow();
    expect(() => stack.reorder([a, a, b])).toThrow();
    expect(() => stack.reorder([a, b, stranger])).toThrow();
    expect(stack.children()).toEqual([a, b, c]);
  });
});
