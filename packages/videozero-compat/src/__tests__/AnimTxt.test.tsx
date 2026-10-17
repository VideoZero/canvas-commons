import {Layout, Node, Txt, useScene2D} from '@canvas-commons/2d';
import {
  Color,
  ThreadGenerator,
  TimingFunction,
  all,
  cancel,
  waitFor,
} from '@canvas-commons/core';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {AnimTxt} from '../AnimTxt';
import {
  failOnSceneErrors,
  generatorTest,
  mockScene2D,
  play,
  playbackManager,
} from './mockScene2D';
import {mockTextContext} from './mockTextContext';

type Helper = (txt: AnimTxt) => ThreadGenerator;

const Entrances: Record<string, Helper> = {
  typewriter: txt => txt.typewriter(),
  fadeUp: txt => txt.fadeUp(),
  fadeDown: txt => txt.fadeDown(),
  fadeLeft: txt => txt.fadeLeft(),
  fadeRight: txt => txt.fadeRight(),
  motionUp: txt => txt.motionUp(),
  motionDown: txt => txt.motionDown(),
  scaleIn: txt => txt.scaleIn(),
  bounceIn: txt => txt.bounceIn(),
  revealUp: txt => txt.revealUp(),
  revealDown: txt => txt.revealDown(),
  revealLeft: txt => txt.revealLeft(),
  revealRight: txt => txt.revealRight(),
  wordByWord: txt => txt.wordByWord(),
  lineByLine: txt => txt.lineByLine(),
  trackingIn: txt => txt.trackingIn(),
  waveIn: txt => txt.waveIn(),
  rotateIn: txt => txt.rotateIn(),
  scramble: txt => txt.scramble(),
  outline: txt => txt.outline(),
  neon: txt => txt.neon(),
  shadowIn: txt => txt.shadowIn(),
};

const Exits: Record<string, Helper> = {
  fadeOut: txt => txt.fadeOut(),
  fadeOutUp: txt => txt.fadeOutUp(),
  fadeOutDown: txt => txt.fadeOutDown(),
  scaleOut: txt => txt.scaleOut(),
  revealOutUp: txt => txt.revealOutUp(),
  revealOutDown: txt => txt.revealOutDown(),
  trackingOut: txt => txt.trackingOut(),
  swapOut: txt => txt.swapOut(),
};

/** The pieces a running animation draws, found next to the source. */
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

/** The resting place of every grapheme of the text. */
function homes(txt: AnimTxt) {
  const pieces = txt.split();
  return pieces.map(piece => piece.position());
}

describe('AnimTxt (headless)', () => {
  mockScene2D();

  it(
    'fades the source in when there is nothing to split',
    generatorTest(function* (view) {
      const txt = new AnimTxt({text: 'abc', opacity: 0});
      view.add(txt);
      yield* txt.waveIn(0.5);
      expect(txt.opacity()).toBe(1);
      yield* txt.swapOut(0.5);
      expect(txt.opacity()).toBe(0);
      expect(view.children()).toEqual([txt]);
    }),
  );
});

describe('AnimTxt', () => {
  mockScene2D();
  failOnSceneErrors();
  mockTextContext(10);

  const create = (
    view: Node,
    props: Partial<{opacity: number; text: string; width: number}> = {},
  ) => {
    const txt = new AnimTxt({
      text: 'abc',
      fontSize: 10,
      lineHeight: 20,
      ...props,
    });
    view.add(txt);
    return txt;
  };

  for (const [name, helper] of Object.entries(Entrances)) {
    it(
      `${name}() animates pieces and ends with the source shown`,
      generatorTest(function* (view) {
        const txt = create(view, {opacity: 0});
        yield* probeAt(helper(txt), 0.01, () => {
          expect(txt.opacity()).toBe(0);
          expect(piecesOf(view).length).toBeGreaterThan(0);
        });
        expect(txt.opacity()).toBe(1);
        expect(view.children()).toEqual([txt]);
        expect(txt.isSplit).toBe(false);
      }),
    );
  }

  for (const [name, helper] of Object.entries(Exits)) {
    it(
      `${name}() ends with the source hidden and nothing left behind`,
      generatorTest(function* (view) {
        const txt = create(view);
        yield* probeAt(helper(txt), 0.01, () => {
          expect(txt.opacity()).toBe(0);
          expect(piecesOf(view).length).toBe(3);
        });
        expect(txt.opacity()).toBe(0);
        expect(view.children()).toEqual([txt]);
      }),
    );
  }

  it(
    'types the characters one after another',
    generatorTest(function* (view) {
      const txt = create(view, {opacity: 0});
      yield* probeAt(txt.typewriter(5, 0.1), 0.15, () => {
        expect(piecesOf(view).map(piece => piece.opacity())).toEqual([1, 1, 0]);
      });
    }),
  );

  for (const [name, helper, dy] of [
    ['fadeUp', (txt: AnimTxt) => txt.fadeUp(), 0.3],
    ['fadeDown', (txt: AnimTxt) => txt.fadeDown(), -0.3],
    ['motionUp', (txt: AnimTxt) => txt.motionUp(), 1],
    ['motionDown', (txt: AnimTxt) => txt.motionDown(), -1],
    ['bounceIn', (txt: AnimTxt) => txt.bounceIn(), -1],
    ['wordByWord', (txt: AnimTxt) => txt.wordByWord(), 0.2],
    ['shadowIn', (txt: AnimTxt) => txt.shadowIn(), 0.4],
  ] as const) {
    it(
      `${name}() starts the characters ${dy} character heights away`,
      generatorTest(function* (view) {
        const txt = create(view, {opacity: 0});
        const rest = homes(txt);
        yield* probeAt(helper(txt), 0, () => {
          const pieces = piecesOf(view);
          pieces.forEach((piece, i) => {
            expect(piece.y()).toBeCloseTo(rest[i].y + dy * 20, 5);
            expect(piece.x()).toBeCloseTo(rest[i].x, 5);
          });
        });
      }),
    );
  }

  for (const [name, helper, dx] of [
    ['fadeLeft', (txt: AnimTxt) => txt.fadeLeft(), 3],
    ['fadeRight', (txt: AnimTxt) => txt.fadeRight(), -3],
  ] as const) {
    it(
      `${name}() starts the characters a tenth of their line away`,
      generatorTest(function* (view) {
        const txt = create(view, {opacity: 0});
        const rest = homes(txt);
        yield* probeAt(helper(txt), 0, () => {
          piecesOf(view).forEach((piece, i) =>
            expect(piece.x()).toBeCloseTo(rest[i].x + dx, 5),
          );
        });
      }),
    );
  }

  it(
    'shows motion characters within 0.15 seconds',
    generatorTest(function* (view) {
      const txt = create(view, {opacity: 0});
      yield* probeAt(txt.motionUp(1, 0), 0.2, () => {
        piecesOf(view).forEach(piece => expect(piece.opacity()).toBe(1));
      });
    }),
  );

  it(
    'spins the characters in',
    generatorTest(function* (view) {
      const txt = create(view, {opacity: 0});
      yield* probeAt(txt.rotateIn(), 0, () => {
        const [piece] = piecesOf(view);
        expect(piece.scale().x).toBeCloseTo(0.5, 5);
        expect(piece.rotation()).toBeCloseTo(90, 3);
      });
    }),
  );

  for (const [name, helper, offset] of [
    ['revealUp', (txt: AnimTxt) => txt.revealUp(), [0, 28]],
    ['revealDown', (txt: AnimTxt) => txt.revealDown(), [0, -28]],
    ['revealLeft', (txt: AnimTxt) => txt.revealLeft(), [38, 0]],
    ['revealRight', (txt: AnimTxt) => txt.revealRight(), [-38, 0]],
  ] as const) {
    it(
      `${name}() slides all characters at once from behind their line`,
      generatorTest(function* (view) {
        const txt = create(view, {opacity: 0});
        yield* probeAt(helper(txt), 0, () => {
          const [mask] = view.children()[1].children();
          if (!(mask instanceof Layout)) throw new Error('no mask');
          expect(mask.clip()).toBe(true);
          const pieces = mask.children();
          expect(pieces).toHaveLength(3);
          const first = pieces[0].position();
          // The second piece rests 10px right of the first one.
          expect(pieces[1].position().x - first.x).toBeCloseTo(10, 5);
          // The mask is the line box grown by 4px on every side.
          expect(first.y).toBeCloseTo(offset[1], 5);
          expect(first.x - (-mask.width() / 2 + 4 + 5) - offset[0]).toBeCloseTo(
            0,
            5,
          );
        });
      }),
    );
  }

  it(
    'reveals the lines one after another',
    generatorTest(function* (view) {
      const txt = create(view, {opacity: 0, text: 'aaa bbb', width: 45});
      expect(txt.lineCount()).toBe(2);
      yield* probeAt(txt.lineByLine(0.5, 0.15), 0.1, () => {
        const masks = view.children()[1].children();
        expect(masks).toHaveLength(2);
        const [first, second] = masks.map(mask => mask.children()[0].y());
        expect(first).toBeLessThan(28);
        expect(second).toBeCloseTo(28, 5);
      });
    }),
  );

  it(
    'fades the words in one after another',
    generatorTest(function* (view) {
      const txt = create(view, {opacity: 0, text: 'ab cd'});
      yield* probeAt(txt.wordByWord(0.4, 0.1), 0.05, () => {
        const opacities = piecesOf(view)
          .filter(piece => piece.text().trim() !== '')
          .map(piece => piece.opacity() > 0);
        expect(opacities).toEqual([true, true, false, false]);
      });
    }),
  );

  it(
    'tracks the characters in towards the middle of the text',
    generatorTest(function* (view) {
      const txt = create(view, {opacity: 0});
      const rest = homes(txt);
      const center = (rest[0].x + rest[1].x + rest[2].x) / 3;
      yield* probeAt(txt.trackingIn(0.7, 0.5), 0, () => {
        piecesOf(view).forEach((piece, i) =>
          expect(piece.x()).toBeCloseTo(
            rest[i].x + (rest[i].x - center) * 0.5,
            5,
          ),
        );
      });
      yield* probeAt(
        txt.trackingOut(1, 0.5, () => 1),
        0.1,
        () => {
          piecesOf(view).forEach((piece, i) =>
            expect(piece.x()).toBeCloseTo(
              rest[i].x - (rest[i].x - center) * 0.5,
              5,
            ),
          );
        },
      );
    }),
  );

  it(
    'settles the wave on the resting places',
    generatorTest(function* (view) {
      const txt = create(view, {opacity: 0});
      const rest = homes(txt);
      let moved = false;
      yield* probeAt(txt.waveIn(2), 0.3, () => {
        moved = piecesOf(view).some(
          (piece, i) => Math.abs(piece.y() - rest[i].y) > 1e-3,
        );
      });
      expect(moved).toBe(true);
      expect(txt.opacity()).toBe(1);
    }),
  );

  it(
    'scrambles the characters with the scene random generator',
    generatorTest(function* (view) {
      const random = vi.spyOn(Math, 'random');
      const txt = create(view, {opacity: 0, text: 'abcdef'});
      let scrambled = '';
      yield* probeAt(txt.scramble(2), 0.05, () => {
        scrambled = piecesOf(view)
          .map(piece => piece.text())
          .join('');
      });
      expect(scrambled).toHaveLength(6);
      expect(scrambled).not.toBe('abcdef');
      expect(random).not.toHaveBeenCalled();
      expect(txt.text()).toBe('abcdef');
      random.mockRestore();
    }),
  );

  it(
    'draws outlines in the fill color before filling the characters',
    generatorTest(function* (view) {
      const txt = create(view, {opacity: 0});
      txt.fill('#ff0000');
      yield* probeAt(txt.outline(), 0.01, () => {
        const [piece] = piecesOf(view);
        expect(piece.fill()).toBeNull();
        const stroke = piece.stroke();
        expect(stroke instanceof Color && stroke.hex()).toBe('#ff0000');
        expect(piece.lineWidth()).toBe(1.5);
      });
    }),
  );

  it(
    'keeps the glow of neon and the shadow of shadowIn',
    generatorTest(function* (view) {
      const txt = create(view, {opacity: 0});
      txt.fill('#00ff00');
      yield* probeAt(txt.neon(0.5, 0), 0.25, () => {
        const [piece] = piecesOf(view);
        expect(piece.shadowBlur()).toBeGreaterThan(0);
        expect(piece.shadowBlur()).toBeLessThan(20);
        expect(piece.shadowColor().hex()).toBe('#00ff00');
      });
      expect(txt.shadowBlur()).toBe(20);
      expect(txt.shadowColor().hex()).toBe('#00ff00');

      const other = create(view, {opacity: 0});
      yield* other.shadowIn();
      expect(other.shadowBlur()).toBe(4);
    }),
  );

  const end: TimingFunction = () => 1;
  for (const [name, helper, dy, opacity] of [
    ['fadeOutUp', (txt: AnimTxt) => txt.fadeOutUp(1, 0, end), -3, 0],
    ['fadeOutDown', (txt: AnimTxt) => txt.fadeOutDown(1, 0, end), 3, 0],
    ['revealOutUp', (txt: AnimTxt) => txt.revealOutUp(1, end), -20, 1],
    ['revealOutDown', (txt: AnimTxt) => txt.revealOutDown(1, end), 20, 1],
    ['swapOut', (txt: AnimTxt) => txt.swapOut(1, end), -20, 0],
  ] as const) {
    it(
      `${name}() moves the characters ${dy}px`,
      generatorTest(function* (view) {
        const txt = create(view);
        const rest = homes(txt);
        yield* probeAt(helper(txt), 0.1, () => {
          piecesOf(view).forEach((piece, i) => {
            expect(piece.y()).toBeCloseTo(rest[i].y + dy, 5);
            expect(piece.opacity()).toBe(opacity);
          });
        });
        expect(txt.opacity()).toBe(0);
      }),
    );
  }

  it(
    'scales the characters out to 0.8',
    generatorTest(function* (view) {
      const txt = create(view);
      yield* probeAt(txt.scaleOut(1, end), 0.1, () => {
        expect(piecesOf(view)[0].scale().x).toBeCloseTo(0.8, 5);
      });
    }),
  );

  it(
    'keeps the opacity a visible source had',
    generatorTest(function* (view) {
      const txt = create(view, {opacity: 0.5});
      yield* probeAt(txt.fadeUp(), 0.1, () => {
        expect(view.children()[1].opacity()).toBe(0.5);
      });
      expect(txt.opacity()).toBe(0.5);
    }),
  );

  describe('cancellation', () => {
    for (const [name, helper] of [
      ['a delegated helper', (txt: AnimTxt) => txt.fadeUp(2)],
      ['a custom helper', (txt: AnimTxt) => txt.waveIn(2)],
    ] as const) {
      it(
        `cleans up when ${name} is cut short`,
        generatorTest(function* (view) {
          const txt = create(view, {opacity: 0});
          const task = helper(txt);
          yield task;
          yield* waitFor(0.2);
          expect(view.children()).toHaveLength(2);
          cancel(task);
          expect(view.children()).toEqual([txt]);
          expect(txt.opacity()).toBe(1);
        }),
      );
    }

    it(
      'hides the source when an exit is cut short',
      generatorTest(function* (view) {
        const txt = create(view);
        const task = txt.swapOut(2);
        yield task;
        yield* waitFor(0.2);
        cancel(task);
        expect(view.children()).toEqual([txt]);
        expect(txt.opacity()).toBe(0);
      }),
    );
  });

  // VZ 25000cc3: a node reused with new text drew the pieces of the old text,
  // and an exit's offsets leaked into the next entrance.
  describe('text changes', () => {
    it(
      'drops a manual split when the text changes',
      generatorTest(function* (view) {
        const txt = create(view);
        txt.splitChars();
        expect(txt.chars.map(piece => piece.text())).toEqual(['a', 'b', 'c']);
        expect(txt.opacity()).toBe(0);
        txt.text('xy');
        expect(txt.isSplit).toBe(false);
        expect(txt.chars).toEqual([]);
        expect(txt.opacity()).toBe(1);
        expect(view.children()).toEqual([txt]);
        yield* probeAt(txt.fadeUp(1), 0.5, () => {
          expect(piecesOf(view).map(piece => piece.text())).toEqual(['x', 'y']);
        });
      }),
    );

    it(
      'drops a manual split when the text is tweened',
      generatorTest(function* (view) {
        const txt = create(view);
        txt.splitChars();
        yield* txt.text('abcd', 0.2);
        expect(txt.isSplit).toBe(false);
        expect(view.children()).toEqual([txt]);
        expect(txt.opacity()).toBe(1);
      }),
    );

    it(
      'does not carry exit offsets into the next entrance',
      generatorTest(function* (view) {
        const txt = create(view, {opacity: 0});
        yield* txt.fadeUp();
        yield* txt.fadeOutUp();
        yield* txt.swapOut();
        txt.text('xy');
        const rest = homes(txt);
        yield* probeAt(txt.fadeUp(1), 0.99, () => {
          const pieces = piecesOf(view);
          expect(pieces.map(piece => piece.text())).toEqual(['x', 'y']);
          pieces.forEach((piece, i) => {
            expect(piece.x()).toBeCloseTo(rest[i].x, 5);
            expect(piece.y()).toBeCloseTo(rest[i].y, 1);
          });
        });
        expect(view.children()).toEqual([txt]);
        expect(txt.opacity()).toBe(1);
      }),
    );

    it(
      'replaces a manual split when a helper starts',
      generatorTest(function* (view) {
        const txt = create(view, {opacity: 0});
        txt.splitChars(true);
        yield* txt.fadeUp();
        expect(txt.isSplit).toBe(false);
        expect(view.children()).toEqual([txt]);
        expect(txt.opacity()).toBe(1);
      }),
    );
  });

  describe('splitChars', () => {
    it(
      'exposes the characters, words and lines',
      generatorTest(function* (view) {
        const txt = create(view, {text: 'ab cd ef', width: 55});
        expect(txt.lineCount()).toBe(2);
        txt.splitChars();
        expect(txt.isSplit).toBe(true);
        expect(txt.splitResult?.pieces).toBe(txt.chars);
        expect(
          txt.chars.filter(piece => piece.text().trim() !== '').length,
        ).toBe(6);
        expect(
          txt.words.map(word => word.map(piece => piece.text()).join('')),
        ).toEqual(['ab', 'cd', 'ef']);
        expect(
          txt
            .lineChars(1)
            .map(piece => piece.text())
            .join('')
            .trim(),
        ).toBe('ef');
        expect(txt.lineChars(5)).toEqual([]);
        expect(txt.lineWidths[1]).toBeCloseTo(20, 5);
        expect(txt.maxCharHeight).toBe(20);
        expect(txt.saveX()).toEqual(txt.chars.map(piece => piece.x()));
        expect(txt.saveY()).toEqual(txt.chars.map(piece => piece.y()));
        txt.unsplit();
        expect(txt.isSplit).toBe(false);
        expect(txt.words).toEqual([]);
        expect(txt.lineWidths).toEqual([]);
        expect(txt.maxCharHeight).toBe(0);
        expect(view.children()).toEqual([txt]);
      }),
    );

    it(
      'measures clipped lines without their padding',
      generatorTest(function* (view) {
        const txt = create(view);
        txt.splitChars(true, 6);
        expect(txt.lineWidths).toEqual([30]);
        const [mask] = view.children()[1].children();
        expect(mask instanceof Layout && mask.width()).toBeCloseTo(42, 5);
        txt.unsplit();
      }),
    );

    it(
      'keeps the source opacity across a split',
      generatorTest(function* (view) {
        const txt = create(view, {opacity: 0.4});
        txt.splitChars();
        expect(view.children()[1].opacity()).toBe(0.4);
        txt.unsplit();
        expect(txt.opacity()).toBe(0.4);
      }),
    );

    it(
      'keeps the smooth flag for source compatibility',
      generatorTest(function* (view) {
        const txt = create(view);
        expect(txt.smooth).toBe(AnimTxt.defaultSmooth);
        expect(txt.disableSmooth().smooth).toBe(false);
        expect(txt.enableSmooth().smooth).toBe(true);
      }),
    );
  });

  describe('lineJoin default', () => {
    afterEach(() => {
      AnimTxt.defaultLineJoin = null;
    });

    it(
      'uses the default line join of AnimTxt for itself and nested text',
      generatorTest(function* () {
        const plain = new AnimTxt({text: 'a'});
        expect(plain.lineJoin()).toBe('miter');
        AnimTxt.defaultLineJoin = 'round';
        const nested = new Txt({text: 'b'});
        const txt = new AnimTxt({children: [nested]});
        expect(txt.lineJoin()).toBe('round');
        expect(nested.lineJoin()).toBe('round');
        expect(new AnimTxt({text: 'c', lineJoin: 'bevel'}).lineJoin()).toBe(
          'bevel',
        );
        expect(new Txt({text: 'd'}).lineJoin()).toBe('miter');
      }),
    );
  });
});

describe('AnimTxt entrance warning', () => {
  mockScene2D();
  mockTextContext(10);

  let warn: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    playbackManager().fps = 10;
    Node.warnVisibleBeforeEntrance = true;
    warn = vi.spyOn(console, 'warn').mockReturnValue(undefined);
  });

  afterEach(() => {
    Node.warnVisibleBeforeEntrance = false;
    warn.mockRestore();
  });

  it('warns once when visible text starts an entrance', () => {
    const txt = new AnimTxt({text: 'Hello world', fontSize: 10});
    play(function* () {
      useScene2D().getView().add(txt);
      yield* waitFor(1.5);
      yield* txt.fadeUp();
      yield* txt.fadeOut();
      txt.opacity(1);
      yield* txt.scaleIn();
    });
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toMatchObject({
      message:
        'AnimTxt "Hello world" is already visible when its fadeUp() entrance starts at 1.5s (added at 0.0s).',
    });
  });

  it('does not warn for hidden, blank, or freshly changed text', () => {
    const hidden = new AnimTxt({text: 'a', fontSize: 10, opacity: 0});
    const blank = new AnimTxt({text: '  ', fontSize: 10});
    const changed = new AnimTxt({text: 'b', fontSize: 10});
    play(function* () {
      const root = useScene2D().getView();
      root.add([hidden, blank, changed]);
      yield* waitFor(1.5);
      changed.text('new text');
      yield* all(hidden.fadeUp(), blank.fadeUp(), changed.fadeUp());
    });
    expect(warn).not.toHaveBeenCalled();
  });

  it('shortens long text in the label', () => {
    const txt = new AnimTxt({
      text: 'A rather long sentence that goes on',
      fontSize: 10,
    });
    play(function* () {
      useScene2D().getView().add(txt);
      yield* waitFor(1);
      yield* txt.typewriter();
    });
    expect(warn.mock.calls[0][0].message).toMatch(
      /^AnimTxt "A rather long sentenc…" is already visible/,
    );
  });
});
