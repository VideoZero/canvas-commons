import {
  Direction,
  ThreadGenerator,
  TimingFunction,
  Vector2,
  all,
  decorate,
  easeInCubic,
  easeOutBack,
  easeOutCubic,
  sequence,
  threadable,
} from '@canvas-commons/core';
import {Txt, TxtSplitGranularity} from '../components/Txt';
import {SplitTextOptions, TextSplit, splitText} from './splitText';

/**
 * Options shared by the text animations.
 */
export interface TextAnimationOptions {
  /** How to cut the text, see {@link Txt.split}. */
  by?: TxtSplitGranularity;
  /** How long each piece animates, in seconds. */
  duration?: number;
  /** The delay between the starts of consecutive pieces, in seconds. */
  stagger?: number;
  /** The timing function of each piece. */
  timingFunction?: TimingFunction;
}

/**
 * Options for the text animations that move pieces.
 */
export interface TextMoveOptions extends TextAnimationOptions {
  /** The direction the pieces travel in. Left out, they don't move. */
  direction?: Direction;
  /**
   * How far the pieces travel, in pixels. Defaults to `0.3` of the line
   * height.
   */
  distance?: number;
}

/**
 * Options for the text animations that scale pieces.
 */
export interface TextScaleOptions extends TextAnimationOptions {
  /** The scale the pieces start (or end) at. */
  scale?: number;
  /** The rotation the pieces start (or end) at, in degrees. */
  rotation?: number;
}

/**
 * Options for the text animations that slide pieces behind a mask.
 */
export interface TextRevealOptions extends TextAnimationOptions {
  /** The direction the pieces travel in. Defaults to `Direction.Top`. */
  direction?: Direction;
  /**
   * How far, in pixels, the mask of a line reaches past its line box on every
   * side. Defaults to `4`.
   */
  clipPadding?: number;
}

/**
 * Options for the text animations that spread pieces apart.
 */
export interface TextTrackingOptions extends TextAnimationOptions {
  /**
   * How far the pieces spread out from the middle of their line, as a share
   * of their distance to it.
   */
  spread?: number;
}

type PieceAnimation = (
  piece: Txt,
  index: number,
  split: TextSplit,
) => ThreadGenerator;

/** The unit offset a direction moves by on screen, where `y` points down. */
function directionVector(direction: Direction | undefined): Vector2 {
  switch (direction) {
    case Direction.Top:
      return new Vector2(0, -1);
    case Direction.Bottom:
      return new Vector2(0, 1);
    case Direction.Left:
      return Vector2.left;
    case Direction.Right:
      return Vector2.right;
    default:
      return Vector2.zero;
  }
}

function* animate(
  source: Txt,
  entrance: boolean,
  options: SplitTextOptions,
  stagger: number,
  duration: number,
  prepare: (piece: Txt, index: number, split: TextSplit) => void,
  run: PieceAnimation,
): ThreadGenerator {
  const visible = source.opacity() > 0 ? source.opacity() : 1;
  const split = splitText(source, options);
  if (split.pieces.length === 0) {
    split.restore(entrance ? 0 : visible);
    yield* source.opacity(entrance ? visible : 0, duration);
    return;
  }
  try {
    if (entrance) split.container.opacity(visible);
    split.pieces.forEach((piece, index) => prepare(piece, index, split));
    yield* sequence(
      stagger,
      ...split.pieces.map((piece, index) => run(piece, index, split)),
    );
  } finally {
    split.restore(entrance ? visible : 0);
  }
}

decorate(textTypewriter, threadable());
/**
 * Show the pieces of a text one after another, like a typewriter.
 *
 * @remarks
 * Like every text entrance, it ends with the source shown: at its own
 * opacity, or fully when it started hidden. Create the text with
 * `opacity={0}` so it isn't visible before the entrance.
 *
 * @example
 * ```tsx
 * const label = createRef<Txt>();
 * view.add(<Txt ref={label} opacity={0} text="Hello world" />);
 * yield* textTypewriter(label(), {stagger: 0.05});
 * ```
 *
 * @param source - The text to show.
 * @param options - The pieces (`'grapheme'` by default) and the delay
 *                  between them (`0.04` by default).
 */
export function* textTypewriter(
  source: Txt,
  {by = 'grapheme', stagger = 0.04}: TextAnimationOptions = {},
): ThreadGenerator {
  yield* animate(
    source,
    true,
    {by},
    stagger,
    0,
    piece => piece.opacity(0),
    piece => piece.opacity(1, 0),
  );
}

decorate(textFadeIn, threadable());
/**
 * Fade the pieces of a text in one after another, optionally moving them
 * into place.
 *
 * @example
 * ```tsx
 * // Characters rise into place.
 * yield* textFadeIn(label(), {direction: Direction.Top});
 * // Words drop in.
 * yield* textFadeIn(label(), {by: 'word', direction: Direction.Bottom});
 * ```
 *
 * @param source - The text to show.
 * @param options - How the pieces move.
 */
export function* textFadeIn(
  source: Txt,
  {
    by = 'grapheme',
    duration = 0.5,
    stagger = 0.03,
    timingFunction = easeOutCubic,
    direction,
    distance,
  }: TextMoveOptions = {},
): ThreadGenerator {
  const towards = directionVector(direction);
  yield* animate(
    source,
    true,
    {by},
    stagger,
    duration,
    (piece, index, split) => {
      const offset = distance ?? split.units[index].height * 0.3;
      piece.opacity(0);
      piece.position(split.homes[index].sub(towards.scale(offset)));
    },
    (piece, index, split) =>
      all(
        piece.opacity(1, duration * 0.8, timingFunction),
        piece.position(split.homes[index], duration, timingFunction),
      ),
  );
}

decorate(textScaleIn, threadable());
/**
 * Grow the pieces of a text into place one after another.
 *
 * @example
 * ```tsx
 * yield* textScaleIn(label());
 * // Characters spin in.
 * yield* textScaleIn(label(), {scale: 0.5, rotation: 90});
 * ```
 *
 * @param source - The text to show.
 * @param options - The scale (`0` by default) and rotation (`0` by default)
 *                  the pieces start at.
 */
export function* textScaleIn(
  source: Txt,
  {
    by = 'grapheme',
    duration = 0.5,
    stagger = 0.05,
    timingFunction = easeOutBack,
    scale = 0,
    rotation = 0,
  }: TextScaleOptions = {},
): ThreadGenerator {
  yield* animate(
    source,
    true,
    {by},
    stagger,
    duration,
    piece => {
      piece.opacity(0);
      piece.scale(scale);
      piece.rotation(rotation);
    },
    piece =>
      all(
        piece.opacity(1, duration * 0.4),
        piece.scale(1, duration, timingFunction),
        piece.rotation(0, duration, timingFunction),
      ),
  );
}

/** How far a piece travels to leave the mask of its line. */
function revealOffset(split: TextSplit, index: number, towards: Vector2) {
  const box = split.lineBoxOf(index);
  return towards.mul([box.width, box.height]);
}

decorate(textRevealIn, threadable());
/**
 * Slide the pieces of a text into place from behind the edge of their line.
 *
 * @example
 * ```tsx
 * // Lines rise from below their baseline, one after another.
 * yield* textRevealIn(label());
 * // Every character slides in from the left at once.
 * yield* textRevealIn(label(), {
 *   by: 'grapheme',
 *   direction: Direction.Right,
 *   stagger: 0,
 * });
 * ```
 *
 * @param source - The text to show.
 * @param options - The pieces (`'line'` by default) and the direction they
 *                  travel in.
 */
export function* textRevealIn(
  source: Txt,
  {
    by = 'line',
    duration = 0.6,
    stagger = 0.1,
    timingFunction = easeOutCubic,
    direction = Direction.Top,
    clipPadding,
  }: TextRevealOptions = {},
): ThreadGenerator {
  const towards = directionVector(direction);
  yield* animate(
    source,
    true,
    {by, clip: true, clipPadding},
    stagger,
    duration,
    (piece, index, split) =>
      piece.position(
        split.homes[index].sub(revealOffset(split, index, towards)),
      ),
    (piece, index, split) =>
      piece.position(split.homes[index], duration, timingFunction),
  );
}

/** Where a piece sits spread out from the middle of its line. */
function spreadOut(split: TextSplit, index: number, spread: number) {
  const home = split.homes[index];
  const middle = split.lineBoxOf(index).center.x;
  return home.addX((home.x - middle) * spread);
}

decorate(textTrackingIn, threadable());
/**
 * Fade a text in while its pieces close in on the middle of their line.
 *
 * @example
 * ```tsx
 * yield* textTrackingIn(label(), {spread: 0.5});
 * ```
 *
 * @param source - The text to show.
 * @param options - How far the pieces start spread out (`0.4` by default).
 */
export function* textTrackingIn(
  source: Txt,
  {
    by = 'grapheme',
    duration = 0.7,
    stagger = 0,
    timingFunction = easeOutCubic,
    spread = 0.4,
  }: TextTrackingOptions = {},
): ThreadGenerator {
  yield* animate(
    source,
    true,
    {by},
    stagger,
    duration,
    (piece, index, split) => {
      piece.opacity(0);
      piece.position(spreadOut(split, index, spread));
    },
    (piece, index, split) =>
      all(
        piece.opacity(1, duration * 0.7, timingFunction),
        piece.position(split.homes[index], duration, timingFunction),
      ),
  );
}

decorate(textFadeOut, threadable());
/**
 * Fade the pieces of a text out, optionally moving them away.
 *
 * @remarks
 * Like every text exit, it ends with the source hidden (`opacity` `0`) and
 * no pieces left behind, so the text can be changed and shown again.
 *
 * @example
 * ```tsx
 * yield* textFadeOut(label(), {direction: Direction.Top});
 * label().text('Next');
 * yield* textFadeIn(label());
 * ```
 *
 * @param source - The text to hide.
 * @param options - How the pieces move. By default all pieces leave at once.
 */
export function* textFadeOut(
  source: Txt,
  {
    by = 'grapheme',
    duration = 0.35,
    stagger = 0,
    timingFunction = easeInCubic,
    direction,
    distance,
  }: TextMoveOptions = {},
): ThreadGenerator {
  const towards = directionVector(direction);
  yield* animate(
    source,
    false,
    {by},
    stagger,
    duration,
    () => {},
    (piece, index, split) =>
      all(
        piece.opacity(0, duration, timingFunction),
        piece.position(
          split.homes[index].add(
            towards.scale(distance ?? split.units[index].height * 0.3),
          ),
          duration,
          timingFunction,
        ),
      ),
  );
}

decorate(textScaleOut, threadable());
/**
 * Shrink the pieces of a text away.
 *
 * @example
 * ```tsx
 * yield* textScaleOut(label(), {scale: 0.8});
 * ```
 *
 * @param source - The text to hide.
 * @param options - The scale (`0` by default) and rotation (`0` by default)
 *                  the pieces end at.
 */
export function* textScaleOut(
  source: Txt,
  {
    by = 'grapheme',
    duration = 0.3,
    stagger = 0,
    timingFunction = easeInCubic,
    scale = 0,
    rotation = 0,
  }: TextScaleOptions = {},
): ThreadGenerator {
  yield* animate(
    source,
    false,
    {by},
    stagger,
    duration,
    () => {},
    piece =>
      all(
        piece.opacity(0, duration, timingFunction),
        piece.scale(scale, duration, timingFunction),
        piece.rotation(rotation, duration, timingFunction),
      ),
  );
}

decorate(textRevealOut, threadable());
/**
 * Slide the pieces of a text out behind the edge of their line.
 *
 * @example
 * ```tsx
 * yield* textRevealOut(label(), {direction: Direction.Bottom});
 * ```
 *
 * @param source - The text to hide.
 * @param options - The pieces (`'line'` by default) and the direction they
 *                  travel in.
 */
export function* textRevealOut(
  source: Txt,
  {
    by = 'line',
    duration = 0.35,
    stagger = 0,
    timingFunction = easeInCubic,
    direction = Direction.Top,
    clipPadding,
  }: TextRevealOptions = {},
): ThreadGenerator {
  const towards = directionVector(direction);
  yield* animate(
    source,
    false,
    {by, clip: true, clipPadding},
    stagger,
    duration,
    () => {},
    (piece, index, split) =>
      piece.position(
        split.homes[index].add(revealOffset(split, index, towards)),
        duration,
        timingFunction,
      ),
  );
}

decorate(textTrackingOut, threadable());
/**
 * Fade a text out while its pieces close in on the middle of their line.
 *
 * @example
 * ```tsx
 * yield* textTrackingOut(label());
 * ```
 *
 * @param source - The text to hide.
 * @param options - How far the pieces close in (`0.2` by default).
 */
export function* textTrackingOut(
  source: Txt,
  {
    by = 'grapheme',
    duration = 0.35,
    stagger = 0,
    timingFunction = easeInCubic,
    spread = 0.2,
  }: TextTrackingOptions = {},
): ThreadGenerator {
  yield* animate(
    source,
    false,
    {by},
    stagger,
    duration,
    () => {},
    (piece, index, split) =>
      all(
        piece.opacity(0, duration, timingFunction),
        piece.position(
          spreadOut(split, index, -spread),
          duration,
          timingFunction,
        ),
      ),
  );
}
