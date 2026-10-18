import {
  ThreadGenerator,
  Vector2,
  createRef,
  usePlayback,
} from '@canvas-commons/core';
import {describe, expect, it} from 'vitest';
import {useScene2D} from '../../scenes';
import type {LayoutAnimateCallback, LayoutProps} from '../Layout';
import {Layout} from '../Layout';
import {Rect} from '../Rect';
import {generatorTest} from './generatorTest';
import {mockScene2D} from './mockScene2D';

interface Box {
  min: Vector2;
  max: Vector2;
}

/** The world-space bounds the node is drawn in, including its ancestors' scale. */
function box(node: Layout): Box {
  const half = node.size().scale(0.5);
  const matrix = node.localToWorld();
  const corners = [
    new Vector2(-half.x, -half.y),
    new Vector2(half.x, -half.y),
    new Vector2(half.x, half.y),
    new Vector2(-half.x, half.y),
  ].map(corner => corner.transformAsPoint(matrix));
  return {
    min: new Vector2(
      Math.min(...corners.map(c => c.x)),
      Math.min(...corners.map(c => c.y)),
    ),
    max: new Vector2(
      Math.max(...corners.map(c => c.x)),
      Math.max(...corners.map(c => c.y)),
    ),
  };
}

function extent(b: Box) {
  return b.max.sub(b.min);
}

function overlap(a: Box, b: Box) {
  const x = Math.min(a.max.x, b.max.x) - Math.max(a.min.x, b.min.x);
  const y = Math.min(a.max.y, b.max.y) - Math.max(a.min.y, b.min.y);
  return x > 0 && y > 0 ? Math.min(x, y) : 0;
}

type Yielded = ThreadGenerator extends Generator<infer T> ? T : never;

interface Frame {
  boxes: Box[];
  sizes: Vector2[];
}

/**
 * Sample every frame of `animation`, plus the settled layout once it
 * finished.
 */
function* sample(
  animation: ThreadGenerator,
  nodes: Layout[],
  duration: number,
): Generator<Yielded, Frame[], ThreadGenerator> {
  const frames: Frame[] = [];
  // A removed node is no longer drawn once it left its parent.
  const capture = () =>
    nodes.every(node => node.parent()) &&
    frames.push({
      boxes: nodes.map(box),
      sizes: nodes.map(node => new Vector2(node.size())),
    });
  capture();
  const task = yield animation;
  capture();
  const count = Math.ceil(duration * usePlayback().fps) + 2;
  for (let i = 0; i < count; i++) {
    yield;
    capture();
  }
  yield* task;
  capture();
  return frames;
}

/** Largest change of any box edge or node size between consecutive frames. */
function maxStep(frames: Frame[]) {
  let max = 0;
  for (let i = 1; i < frames.length; i++) {
    const prev = frames[i - 1];
    const next = frames[i];
    next.boxes.forEach((b, j) => {
      const p = prev.boxes[j];
      max = Math.max(
        max,
        Math.abs(b.min.x - p.min.x),
        Math.abs(b.min.y - p.min.y),
        Math.abs(b.max.x - p.max.x),
        Math.abs(b.max.y - p.max.y),
      );
    });
    next.sizes.forEach((s, j) => {
      const p = prev.sizes[j];
      max = Math.max(max, Math.abs(s.x - p.x), Math.abs(s.y - p.y));
    });
  }
  return max;
}

/** Largest overlap between the subject (index 0) and any sibling. */
function maxOverlap(frames: Frame[]) {
  let max = 0;
  for (const frame of frames) {
    const [subject, ...siblings] = frame.boxes;
    for (const sibling of siblings) {
      max = Math.max(max, overlap(subject, sibling));
    }
  }
  return max;
}

const Duration = 1;
// easeInOutCubic peaks at 1.5x the average speed; no edge here travels more
// than ~300px, so smooth motion stays well below this per frame.
const MaxStep = 25;

type CardProps = LayoutProps;

/** A card with content, so its content size differs from its flex size. */
function makeCard(props: CardProps) {
  return (
    <Rect layout alignItems="center" justifyContent="center" {...props}>
      <Rect width={40} height={30} />
    </Rect>
  ) as Rect;
}

function expectNear(actual: number, expected: number) {
  expect(Math.abs(actual - expected)).toBeLessThan(1);
}

function setup(props: LayoutProps, card: CardProps, count = 3) {
  const stack = createRef<Layout>();
  const cards = Array.from({length: count}, () => makeCard(card));
  useScene2D()
    .getView()
    .add(
      <Layout ref={stack} layout {...props}>
        {cards}
      </Layout>,
    );
  return {stack: stack(), cards};
}

interface Variant {
  name: string;
  props: LayoutProps;
  card: CardProps;
  /** The main-axis component of a vector. */
  main: (v: Vector2) => number;
  /** The main-axis flex size each card ends up with, given the card count. */
  flexSize: (count: number) => number;
}

const Row: LayoutProps = {direction: 'row', width: 620, height: 120, gap: 10};
const Column: LayoutProps = {
  direction: 'column',
  width: 120,
  height: 620,
  gap: 10,
};

const Variants: Variant[] = [
  {
    name: 'basis-0 growing cards in a row',
    props: Row,
    card: {basis: 0, grow: 1, height: 100, layout: true},
    main: v => v.x,
    flexSize: n => (620 - 10 * (n - 1)) / n,
  },
  {
    name: 'growing cards in a column',
    props: Column,
    card: {grow: 1, width: 100},
    main: v => v.y,
    flexSize: n => (620 - 10 * (n - 1)) / n,
  },
  {
    name: 'fixed-size cards',
    props: {...Row, justifyContent: 'center'},
    card: {width: 100, height: 100},
    main: v => v.x,
    flexSize: () => 100,
  },
];

describe('animated add, insert and remove', () => {
  mockScene2D();

  for (const variant of Variants) {
    describe(variant.name, () => {
      it(
        'grows the inserted node from an empty slot',
        generatorTest(function* () {
          const {stack, cards} = setup(variant.props, variant.card);
          const node = makeCard(variant.card);
          const task = stack.insert(node, 1, Duration);
          const frames = yield* sample(task, [node, ...cards], Duration);

          const first = frames[0];
          const last = frames[frames.length - 1];
          expect(variant.main(extent(first.boxes[0]))).toBeLessThan(1);
          expectNear(variant.main(last.sizes[0]), variant.flexSize(4));
          expectNear(variant.main(extent(last.boxes[0])), variant.flexSize(4));
          expect(maxStep(frames)).toBeLessThan(MaxStep);
          expect(maxOverlap(frames)).toBeLessThan(0.5);
          expect(stack.children()).toEqual([cards[0], node, ...cards.slice(1)]);
        }),
      );

      it(
        'grows an appended node from an empty slot',
        generatorTest(function* () {
          const {stack, cards} = setup(variant.props, variant.card);
          const node = makeCard(variant.card);
          const task = stack.add(node, Duration);
          const frames = yield* sample(task, [node, ...cards], Duration);

          expect(variant.main(extent(frames[0].boxes[0]))).toBeLessThan(1);
          expect(maxStep(frames)).toBeLessThan(MaxStep);
          expect(maxOverlap(frames)).toBeLessThan(0.5);
          expect(stack.children()).toEqual([...cards, node]);
        }),
      );

      it(
        'shrinks the removed node from its flex size',
        generatorTest(function* () {
          const {stack, cards} = setup(variant.props, variant.card);
          const [a, removed, c] = cards;
          const before = box(removed);
          expectNear(variant.main(extent(before)), variant.flexSize(3));

          const task = removed.remove(Duration);
          const frames = yield* sample(task, [removed, a, c], Duration);

          const first = frames[0].boxes[0];
          expectNear(first.min.x, before.min.x);
          expectNear(first.min.y, before.min.y);
          expectNear(first.max.x, before.max.x);
          expectNear(first.max.y, before.max.y);
          expect(maxStep(frames)).toBeLessThan(MaxStep);
          expect(maxOverlap(frames)).toBeLessThan(0.5);
          const end = frames[frames.length - 1];
          expect(variant.main(extent(end.boxes[0]))).toBeLessThan(1);
          expectNear(variant.main(end.sizes[1]), variant.flexSize(2));
          expect(stack.children()).toEqual([a, c]);
          expect(removed.parent()).toBeNull();
        }),
      );
    });
  }

  describe('custom animate callback', () => {
    const fade: LayoutAnimateCallback = (node, duration, timing) =>
      node.opacity(0).opacity(1, duration, timing);
    const fadeOut: LayoutAnimateCallback = (node, duration, timing) =>
      node.opacity(0, duration, timing);
    const variant = Variants[0];

    it(
      'keeps the inserted node inside its growing slot',
      generatorTest(function* () {
        const {stack, cards} = setup(variant.props, variant.card);
        const node = makeCard(variant.card);
        const task = stack.insert(node, 1, Duration, undefined, fade);
        const frames = yield* sample(task, [node, ...cards], Duration);

        expect(variant.main(extent(frames[0].boxes[0]))).toBeLessThan(1);
        expect(maxStep(frames)).toBeLessThan(MaxStep);
        expect(maxOverlap(frames)).toBeLessThan(0.5);
        expect(node.opacity()).toBe(1);
      }),
    );

    it(
      'keeps the removed node inside its shrinking slot',
      generatorTest(function* () {
        const {cards} = setup(variant.props, variant.card);
        const [a, removed, c] = cards;
        const before = box(removed);
        const task = removed.remove(Duration, undefined, fadeOut);
        const frames = yield* sample(task, [removed, a, c], Duration);

        expectNear(frames[0].boxes[0].min.x, before.min.x);
        expectNear(frames[0].boxes[0].max.x, before.max.x);
        expect(maxStep(frames)).toBeLessThan(MaxStep);
        expect(maxOverlap(frames)).toBeLessThan(0.5);
      }),
    );
  });

  describe('wrap', () => {
    const props: LayoutProps = {
      direction: 'row',
      wrap: 'wrap',
      width: 330,
      gap: 10,
    };
    const card: CardProps = {width: 100, height: 100};

    it(
      'inserts into a wrapping row without jumps',
      generatorTest(function* () {
        const {stack, cards} = setup(props, card, 5);
        const node = makeCard(card);
        const task = stack.insert(node, 2, Duration);
        const frames = yield* sample(task, [node, ...cards], Duration);

        expect(extent(frames[0].boxes[0]).x).toBeLessThan(1);
        expectNear(extent(frames[frames.length - 1].boxes[0]).x, 100);
        expect(maxStep(frames)).toBeLessThan(MaxStep * 2);
      }),
    );

    it(
      'removes from a wrapping row without jumps',
      generatorTest(function* () {
        const {cards} = setup(props, card, 5);
        const [removed, ...rest] = cards.slice(2).concat(cards.slice(0, 2));
        const before = box(removed);
        const task = removed.remove(Duration);
        const frames = yield* sample(task, [removed, ...rest], Duration);

        expectNear(frames[0].boxes[0].min.x, before.min.x);
        expectNear(frames[0].boxes[0].max.x, before.max.x);
        expect(maxStep(frames)).toBeLessThan(MaxStep * 2);
      }),
    );
  });
});
