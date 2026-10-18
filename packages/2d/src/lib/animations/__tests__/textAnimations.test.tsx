import {
  Color,
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
import {recordingTextContext} from '../../components/__tests__/recordingTextContext';
import {getTextSplit, splitText} from '../splitText';
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

/**
 * Check that an entrance left its text split with every piece in place, then
 * restore the source by hand.
 */
function expectKeptSplit(view: Node, txt: Txt, opacity = 1) {
  const split = getTextSplit(txt);
  expect(split).not.toBeNull();
  if (!split) return;
  expect(split.isActive()).toBe(true);
  expect(txt.opacity()).toBe(0);
  expect(view.children()).toEqual([txt, split.container]);
  expect(split.container.opacity()).toBe(opacity);
  split.pieces.forEach((piece, index) => {
    expect(piece.opacity()).toBe(1);
    expect(piece.scale().x).toBeCloseTo(1, 5);
    expect(piece.rotation()).toBeCloseTo(0, 5);
    expect(piece.position().x).toBeCloseTo(split.homes[index].x, 5);
    expect(piece.position().y).toBeCloseTo(split.homes[index].y, 5);
  });
  split.restore();
  expect(getTextSplit(txt)).toBeNull();
  expect(txt.opacity()).toBe(opacity);
  expect(view.children()).toEqual([txt]);
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
      expectKeptSplit(view, txt);
    }),
  );

  it(
    'lets the pieces follow the style of the source when asked',
    generatorTest(function* (view) {
      const txt = create(view, {opacity: 0});
      yield* all(
        textFadeIn(txt, {followStyle: true, duration: 0.2}),
        txt.fill('#ff0000', 0.2),
      );
      const split = getTextSplit(txt);
      expect(split?.followStyle).toBe(true);
      split?.pieces.forEach(piece =>
        expect(piece.fill()).toEqual(new Color('#ff0000')),
      );
      yield* textFadeOut(txt, {duration: 0.1});
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
      expectKeptSplit(view, txt);
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
      expectKeptSplit(view, txt);
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
      expectKeptSplit(view, txt);
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
      expectKeptSplit(view, txt);
    }),
  );

  it(
    'keeps the opacity a visible source had',
    generatorTest(function* (view) {
      const txt = create(view, {opacity: 0.5});
      yield* probeAt(textFadeIn(txt), 0.1, () => {
        expect(view.children()[1].opacity()).toBe(0.5);
      });
      expectKeptSplit(view, txt, 0.5);
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
      expectKeptSplit(view, txt);
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

  it(
    'animates the pieces of the entrance in the following exit',
    generatorTest(function* (view) {
      const txt = create(view, {opacity: 0});
      yield* textFadeIn(txt);
      const split = getTextSplit(txt);
      yield* probeAt(textFadeOut(txt, {duration: 0.5}), 0.2, () => {
        expect(split?.isActive()).toBe(true);
        expect(view.children()).toEqual([txt, split?.container]);
        expect(piecesOf(view)).toEqual(split?.pieces);
        expect(txt.opacity()).toBe(0);
      });
      expect(split?.isActive()).toBe(false);
      expect(getTextSplit(txt)).toBeNull();
      expect(txt.opacity()).toBe(0);
      expect(view.children()).toEqual([txt]);
    }),
  );

  it(
    'splits anew for an exit that cuts the text differently',
    generatorTest(function* (view) {
      const txt = create(view, {opacity: 0});
      yield* textFadeIn(txt);
      const split = getTextSplit(txt);
      yield* probeAt(textRevealOut(txt, {duration: 0.5}), 0.2, () => {
        expect(split?.isActive()).toBe(false);
        const current = getTextSplit(txt);
        expect(current?.by).toBe('line');
        expect(view.children()).toEqual([txt, current?.container]);
        expect(txt.opacity()).toBe(0);
      });
      expect(txt.opacity()).toBe(0);
      expect(view.children()).toEqual([txt]);
    }),
  );

  it(
    'replaces the split of an earlier entrance',
    generatorTest(function* (view) {
      const txt = create(view, {opacity: 0});
      yield* textFadeIn(txt);
      const first = getTextSplit(txt);
      yield* probeAt(textScaleIn(txt, {duration: 0.5}), 0.2, () => {
        expect(first?.isActive()).toBe(false);
        expect(view.children()).toHaveLength(2);
        expect(txt.opacity()).toBe(0);
      });
      expect(getTextSplit(txt)).not.toBe(first);
      expectKeptSplit(view, txt);
    }),
  );

  it(
    'cleans up when an exit of a kept split is cut short',
    generatorTest(function* (view) {
      const txt = create(view, {opacity: 0});
      yield* textFadeIn(txt);
      const task = textFadeOut(txt, {duration: 2});
      yield task;
      yield* waitFor(0.2);
      cancel(task);
      expect(getTextSplit(txt)).toBeNull();
      expect(view.children()).toEqual([txt]);
      expect(txt.opacity()).toBe(0);
    }),
  );

  it(
    'restores a split text before splitting it again',
    generatorTest(function* (view) {
      const txt = create(view, {opacity: 0.5});
      const first = splitText(txt);
      const second = splitText(txt, {by: 'word'});
      expect(first.isActive()).toBe(false);
      expect(second.opacity).toBe(0.5);
      expect(view.children()).toEqual([txt, second.container]);
      expect(getTextSplit(txt)).toBe(second);
      second.restore();
      expect(txt.opacity()).toBe(0.5);
    }),
  );

  it(
    'stops drawing the pieces once the source is removed',
    generatorTest(function* (view) {
      const txt = create(view, {opacity: 0});
      yield* textFadeIn(txt);
      const split = getTextSplit(txt);
      const drawn = () => {
        const {calls, context} = recordingTextContext();
        split?.container.render(context);
        return calls.length;
      };
      expect(drawn()).toBe(3);
      txt.remove();
      expect(drawn()).toBe(0);
    }),
  );
});

type Glyph = {text: string; x: number; y: number; alpha: number};

/** The text runs the children of `view` draw, in the space of the view. */
function drawnText(view: Node): Glyph[] {
  const {calls, context} = recordingTextContext();
  const glyphs: Glyph[] = [];
  const stack: DOMMatrix[] = [];
  let matrix = new DOMMatrix();
  const save = context.save.bind(context);
  const restore = context.restore.bind(context);
  Object.assign(context, {
    save() {
      stack.push(matrix);
      save();
    },
    restore() {
      matrix = stack.pop() ?? matrix;
      restore();
    },
    setTransform() {
      matrix = new DOMMatrix();
    },
    transform(
      a: number,
      b: number,
      c: number,
      d: number,
      e: number,
      f: number,
    ) {
      matrix = matrix.multiply(new DOMMatrix([a, b, c, d, e, f]));
    },
    translate(x: number, y: number) {
      matrix = matrix.translate(x, y);
    },
    rotate(angle: number) {
      matrix = matrix.rotate((angle * 180) / Math.PI);
    },
    scale(x: number, y: number) {
      matrix = matrix.scale(x, y);
    },
    fillText(text: string, x: number, y: number) {
      const point = new DOMPoint(x, y).matrixTransform(matrix);
      glyphs.push({text, x: point.x, y: point.y, alpha: context.globalAlpha});
    },
  });
  for (const child of view.children()) child.render(context);
  expect(calls).toEqual([]);
  return glyphs;
}

describe('text animations with ligatures', () => {
  mockScene2D();
  failOnSceneErrors();
  // `fi`, `fl` and `ff` draw narrower together than apart, like a ligature
  // or a kerning pair does.
  mockTextContext(
    text => text.length * 10 - 3 * (text.match(/f[fil]/g) ?? []).length,
  );

  it(
    'draws the same glyphs after the entrance ends',
    generatorTest(function* (view) {
      const txt = new Txt({
        text: 'office flow',
        fontSize: 10,
        lineHeight: 20,
        opacity: 0,
      });
      view.add(txt);
      // Pieces reach their place halfway through, so the last frames of the
      // entrance show the final state.
      const early = (value: number) => Math.min(1, value * 2);
      let done = false;
      let last: Glyph[] = [];
      yield* all(
        (function* () {
          yield* textFadeIn(txt, {
            direction: Direction.Top,
            duration: 0.5,
            timingFunction: early,
          });
          done = true;
        })(),
        (function* () {
          while (!done) {
            last = drawnText(view);
            yield;
          }
        })(),
      );
      expect(last.map(glyph => glyph.text).join('')).toBe('officeflow');
      last.forEach(glyph => expect(glyph.alpha).toBe(1));
      expect(drawnText(view)).toEqual(last);
      for (let frame = 0; frame < 5; frame++) {
        yield;
        expect(drawnText(view)).toEqual(last);
      }
      // Restoring by hand draws the source's shaped runs instead.
      getTextSplit(txt)?.restore();
      expect(drawnText(view)).not.toEqual(last);
    }),
  );
});
