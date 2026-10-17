import {
  Direction,
  ThreadGenerator,
  all,
  cancel,
  waitFor,
} from '@canvas-commons/core';
import {describe, expect, it} from 'vitest';
import {Layout} from '../../components/Layout';
import {Node} from '../../components/Node';
import {Txt} from '../../components/Txt';
import {failOnSceneErrors} from '../../components/__tests__/failOnSceneErrors';
import {generatorTest} from '../../components/__tests__/generatorTest';
import {mockScene2D} from '../../components/__tests__/mockScene2D';
import {mockTextContext} from '../../components/__tests__/mockTextContext';
import {
  textFadeIn,
  textFadeOut,
  textRevealIn,
  textRevealOut,
  textScaleIn,
  textScaleOut,
  textTrackingIn,
  textTrackingOut,
  textTypewriter,
} from '../textAnimations';

/** The pieces a running text animation draws, found next to the source. */
function piecesOf(view: Node): Txt[] {
  const container = view
    .children()
    .find(child => !(child instanceof Txt) && child.children().length > 0);
  if (!container) return [];
  return container
    .children()
    .flatMap(child => (child instanceof Txt ? [child] : child.children()))
    .filter((child): child is Txt => child instanceof Txt);
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

describe('text animations (headless)', () => {
  mockScene2D();

  it(
    'fades the source in when there is nothing to split',
    generatorTest(function* (view) {
      const txt = new Txt({text: 'abc', opacity: 0});
      view.add(txt);
      yield* textFadeIn(txt, {duration: 0.5});
      expect(txt.opacity()).toBe(1);
      expect(view.children()).toEqual([txt]);
    }),
  );
});

describe('text animations', () => {
  mockScene2D();
  failOnSceneErrors();
  mockTextContext(10);

  const create = (view: Node, props: Partial<{opacity: number}> = {}) => {
    const txt = new Txt({text: 'abc', fontSize: 10, lineHeight: 20, ...props});
    view.add(txt);
    return txt;
  };

  it(
    'types the pieces one after another',
    generatorTest(function* (view) {
      const txt = create(view, {opacity: 0});
      yield* probeAt(textTypewriter(txt, {stagger: 0.1}), 0.15, () => {
        expect(txt.opacity()).toBe(0);
        expect(piecesOf(view).map(piece => piece.opacity())).toEqual([1, 1, 0]);
      });
      expect(txt.opacity()).toBe(1);
      expect(view.children()).toEqual([txt]);
    }),
  );

  it(
    'moves the pieces in the direction given',
    generatorTest(function* (view) {
      const txt = create(view, {opacity: 0});
      let start: number[] = [];
      yield* probeAt(
        textFadeIn(txt, {direction: Direction.Top, distance: 8}),
        0,
        () => {
          start = piecesOf(view).map(piece => piece.y());
        },
      );
      const rest = txt.split().map(piece => piece.y());
      start.forEach((y, index) => expect(y).toBeCloseTo(rest[index] + 8, 5));
      expect(txt.opacity()).toBe(1);
      expect(view.children()).toEqual([txt]);
    }),
  );

  it(
    'scales the pieces in',
    generatorTest(function* (view) {
      const txt = create(view, {opacity: 0});
      yield* probeAt(textScaleIn(txt, {scale: 0.5, rotation: 90}), 0, () => {
        const [piece] = piecesOf(view);
        expect(piece.scale().x).toBeCloseTo(0.5, 5);
        expect(piece.rotation()).toBeCloseTo(90, 3);
      });
      expect(txt.opacity()).toBe(1);
      expect(view.children()).toEqual([txt]);
    }),
  );

  it(
    'reveals each line from behind its own mask',
    generatorTest(function* (view) {
      const txt = new Txt({
        text: 'aaa bbb',
        fontSize: 10,
        lineHeight: 20,
        width: 45,
        opacity: 0,
      });
      view.add(txt);
      const rest = txt.split('line').map(piece => piece.y());
      yield* probeAt(textRevealIn(txt, {clipPadding: 0}), 0, () => {
        const container = view.children()[1];
        const masks = container.children();
        expect(masks).toHaveLength(2);
        masks.forEach(mask => {
          expect(mask instanceof Layout && mask.clip()).toBe(true);
          const [piece] = mask.children();
          // Below the mask: a whole line height under its resting place.
          expect(piece.position().y).toBeCloseTo(20, 5);
        });
      });
      expect(rest).toHaveLength(2);
      expect(txt.opacity()).toBe(1);
      expect(view.children()).toEqual([txt]);
    }),
  );

  it(
    'spreads the pieces out from the middle of their line',
    generatorTest(function* (view) {
      const txt = create(view, {opacity: 0});
      const rest = txt.split().map(piece => piece.x());
      yield* probeAt(textTrackingIn(txt, {spread: 1}), 0, () => {
        const xs = piecesOf(view).map(piece => piece.x());
        expect(xs[0]).toBeCloseTo(rest[0] * 2, 5);
        expect(xs[1]).toBeCloseTo(rest[1] * 2, 5);
        expect(xs[2]).toBeCloseTo(rest[2] * 2, 5);
      });
      expect(txt.opacity()).toBe(1);
    }),
  );

  it(
    'keeps the opacity a visible source had',
    generatorTest(function* (view) {
      const txt = create(view, {opacity: 0.5});
      yield* probeAt(textFadeIn(txt), 0.1, () => {
        expect(view.children()[1].opacity()).toBe(0.5);
      });
      expect(txt.opacity()).toBe(0.5);
    }),
  );

  for (const [name, exit] of [
    ['textFadeOut', textFadeOut],
    ['textScaleOut', textScaleOut],
    ['textRevealOut', textRevealOut],
    ['textTrackingOut', textTrackingOut],
  ] as const) {
    it(
      `${name} ends with the source hidden and nothing left behind`,
      generatorTest(function* (view) {
        const txt = create(view);
        yield* probeAt(exit(txt), 0.1, () => {
          expect(txt.opacity()).toBe(0);
          expect(piecesOf(view).length).toBeGreaterThan(0);
        });
        expect(txt.opacity()).toBe(0);
        expect(view.children()).toEqual([txt]);
      }),
    );
  }

  it(
    'cleans up when the animation is cut short',
    generatorTest(function* (view) {
      const txt = create(view, {opacity: 0});
      const task = textFadeIn(txt, {duration: 2});
      yield task;
      yield* waitFor(0.2);
      expect(view.children()).toHaveLength(2);
      cancel(task);
      expect(view.children()).toEqual([txt]);
      expect(txt.opacity()).toBe(1);
    }),
  );

  // VZ 25000cc3: a node reused with new text drew the pieces of the old text,
  // and an exit's offsets leaked into the next entrance.
  it(
    'splits the current text on every animation',
    generatorTest(function* (view) {
      const txt = create(view, {opacity: 0});
      yield* textFadeIn(txt, {direction: Direction.Top});
      yield* textFadeOut(txt, {direction: Direction.Top, distance: 50});
      txt.text('xy');
      yield* probeAt(textFadeIn(txt, {duration: 1}), 0.99, () => {
        const pieces = piecesOf(view);
        expect(pieces.map(piece => piece.text())).toEqual(['x', 'y']);
        const glyphs = txt.textGlyphs();
        pieces.forEach((piece, index) =>
          expect(piece.x()).toBeCloseTo(glyphs[index].x, 5),
        );
      });
      expect(view.children()).toEqual([txt]);
      expect(txt.opacity()).toBe(1);
      expect(txt.split().map(piece => piece.text())).toEqual(['x', 'y']);
    }),
  );

  // VZ f45af559: a split right after a layout change measured the old layout.
  it(
    'splits the layout of the frame it starts on',
    generatorTest(function* (view) {
      const txt = new Txt({
        text: 'aaa bbb',
        fontSize: 10,
        lineHeight: 20,
        width: 200,
        opacity: 0,
      });
      view.add(txt);
      expect(txt.lineCount()).toBe(1);
      txt.width(45);
      yield* probeAt(textRevealIn(txt), 0, () => {
        expect(view.children()[1].children()).toHaveLength(2);
      });
    }),
  );
});
