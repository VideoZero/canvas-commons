import {
  TextSplit,
  Txt,
  TxtProps,
  nodeName,
  splitText,
  textFadeIn,
  textFadeOut,
  textRevealIn,
  textScaleIn,
  textScaleOut,
  textTypewriter,
} from '@canvas-commons/2d';
import {
  Color,
  Direction,
  InterpolationFunction,
  SignalValue,
  ThreadGenerator,
  TimingFunction,
  all,
  easeInCubic,
  easeOutBack,
  easeOutCubic,
  easeOutSine,
  isReactive,
  sequence,
  threadable,
  tween,
  useRandom,
} from '@canvas-commons/core';

const ScramblePool =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%&*';

type SplitBody = (split: TextSplit, height: number) => ThreadGenerator;

function maxHeight(split: TextSplit): number {
  return split.units.reduce((max, unit) => Math.max(max, unit.height), 0);
}

/** The pieces of each word: runs of pieces on one line between whitespace. */
function groupWords(split: TextSplit): Txt[][] {
  const words: Txt[][] = [];
  let word: Txt[] = [];
  split.pieces.forEach((piece, index) => {
    const blank = piece.text().trim() === '';
    const newLine =
      index > 0 && split.lineIndexOf(index) !== split.lineIndexOf(index - 1);
    if ((blank || newLine) && word.length > 0) {
      words.push(word);
      word = [];
    }
    if (!blank) word.push(piece);
  });
  if (word.length > 0) words.push(word);
  return words;
}

/** The width of each line the way VideoZero measured it: without padding. */
function lineWidthsOf(split: TextSplit, padding: number): number[] {
  return split.lineBoxes.map(box => box.width - padding * 2);
}

/**
 * A {@link Txt} with the text animation shorthands of VideoZero.
 *
 * @remarks
 * Every helper keeps the name, positional parameters, and defaults it had in
 * VideoZero, and is built on {@link splitText}: the text is split into one
 * standalone piece per grapheme, the pieces are animated in the source's
 * place, and the split is removed when the helper ends (or is canceled).
 * Entrances end with the source shown, exits with the source at opacity `0`.
 *
 * Create the text with `opacity={0}` before an entrance, otherwise it's
 * visible from the start; `Node.warnVisibleBeforeEntrance` reports this.
 *
 * For manual per-character animation use {@link splitChars} and
 * {@link unsplit}.
 *
 * @example
 * ```tsx
 * const title = createRef<AnimTxt>();
 * view.add(<AnimTxt ref={title} text="Hello world" opacity={0} />);
 * yield* title().fadeUp();
 * yield* waitFor(1);
 * yield* title().fadeOutUp();
 * ```
 */
@nodeName('AnimTxt')
export class AnimTxt extends Txt {
  /**
   * The `lineJoin` an `AnimTxt` uses when none is set on it or on a parent
   * text. `null` keeps the Canvas Commons default (`'miter'`).
   *
   * @remarks
   * {@link applyVideoZeroDefaults} sets it to `'round'`, as in VideoZero.
   */
  public static defaultLineJoin: CanvasLineJoin | null = null;

  private splitState: TextSplit | null = null;
  private splitPadding = 0;

  public constructor(props: TxtProps) {
    super(props);
  }

  /**
   * Whether the text is currently split with {@link splitChars}.
   */
  public get isSplit(): boolean {
    return this.splitState !== null;
  }

  /**
   * The current split, for use with the Canvas Commons split helpers.
   */
  public get splitResult(): TextSplit | null {
    return this.splitState;
  }

  /**
   * The character pieces created by {@link splitChars}, in reading order.
   */
  public get chars(): Txt[] {
    return this.splitState?.pieces ?? [];
  }

  /**
   * The pieces of each word, created by {@link splitChars}. Whitespace pieces
   * belong to no word.
   */
  public get words(): Txt[][] {
    return this.splitState ? groupWords(this.splitState) : [];
  }

  /**
   * The width of each line of the split, without the clip padding.
   */
  public get lineWidths(): number[] {
    return this.splitState
      ? lineWidthsOf(this.splitState, this.splitPadding)
      : [];
  }

  /**
   * The height of the tallest piece of the split.
   */
  public get maxCharHeight(): number {
    return this.splitState ? maxHeight(this.splitState) : 0;
  }

  /**
   * Split the text into one piece per grapheme, drawn in place of this node.
   *
   * @remarks
   * Replaces VideoZero's `split(clip, clipPadding)`; `split()` itself is the
   * Canvas Commons method returning standalone pieces. The source is hidden
   * while split. Changing the text or calling {@link unsplit} removes the
   * pieces.
   *
   * @example
   * ```ts
   * title().splitChars();
   * yield* sequence(0.05, ...title().chars.map(c => c.scale(1.2, 0.2).to(1, 0.2)));
   * title().unsplit();
   * ```
   *
   * @param clip - Mask each line to its line box.
   * @param clipPadding - How far the masks reach past the line boxes.
   */
  public splitChars(clip = false, clipPadding = 4): this {
    this.unsplit();
    this.splitState = splitText(this, {by: 'grapheme', clip, clipPadding});
    this.splitPadding = clip ? clipPadding : 0;
    return this;
  }

  /**
   * Remove the pieces created by {@link splitChars} and show the text again.
   */
  public unsplit(): this {
    const split = this.splitState;
    this.splitState = null;
    split?.restore();
    return this;
  }

  /**
   * The current `y` of every character piece.
   */
  public saveY(): number[] {
    return this.chars.map(piece => piece.position.y());
  }

  /**
   * The current `x` of every character piece.
   */
  public saveX(): number[] {
    return this.chars.map(piece => piece.position.x());
  }

  /**
   * The character pieces of the given line of the split.
   *
   * @param lineIndex - The line, counted from `0`.
   */
  public lineChars(lineIndex: number): Txt[] {
    return this.splitState?.lines[lineIndex] ?? [];
  }

  /**
   * Turn on sub-pixel smoothing, as VideoZero's `enableSmooth()`.
   *
   * @remarks
   * Sets the `smooth` signal of `Txt`. Split pieces made afterwards keep it.
   *
   * @example
   * ```ts
   * title().enableSmooth();
   * ```
   */
  public enableSmooth(): this {
    this.smooth(true);
    return this;
  }

  /**
   * Turn off sub-pixel smoothing, as VideoZero's `disableSmooth()`.
   *
   * @example
   * ```ts
   * title().disableSmooth();
   * ```
   */
  public disableSmooth(): this {
    this.smooth(false);
    return this;
  }

  protected override setText(value: SignalValue<string>) {
    if (
      this.parent() &&
      (isReactive(value) ? value() : value) !== this.text()
    ) {
      // New text is new content: the next entrance counts from now.
      AnimTxt.markAttached(this);
    }
    // The pieces reproduce the old text: drop them.
    if (this.splitState) this.unsplit();
    super.setText(value);
  }

  @threadable()
  protected override *tweenText(
    value: SignalValue<string>,
    time: number,
    timingFunction: TimingFunction,
    interpolationFunction: InterpolationFunction<string>,
  ): ThreadGenerator {
    if (this.splitState) this.unsplit();
    yield* super.tweenText(value, time, timingFunction, interpolationFunction);
  }

  protected override getDefaultLineJoin(initial: unknown): unknown {
    return super.getDefaultLineJoin(AnimTxt.defaultLineJoin ?? initial);
  }

  protected override warnVisibleBeforeEntrance(via: string, suffix = '') {
    // Split text is drawn by its pieces, and blank text draws nothing.
    if (this.splitState || !this.text().trim()) return;
    super.warnVisibleBeforeEntrance(via, suffix);
  }

  protected override warningLabel(): string {
    const text = this.text().replace(/\s+/g, ' ').trim();
    const snippet = text.length > 24 ? `${text.slice(0, 21).trimEnd()}…` : text;
    return `${super.warningLabel()} "${snippet}"`;
  }

  /** Starts a helper built on a Canvas Commons text animation. */
  private *delegate(
    entrance: string | null,
    animation: () => ThreadGenerator,
  ): ThreadGenerator {
    if (entrance) this.warnVisibleBeforeEntrance(`${entrance}() entrance`);
    this.unsplit();
    yield* animation();
  }

  /**
   * Split the text for one helper and remove the split afterwards, even when
   * the helper is canceled.
   */
  private *animateSplit(
    entrance: string | null,
    duration: number,
    body: SplitBody,
  ): ThreadGenerator {
    if (entrance) this.warnVisibleBeforeEntrance(`${entrance}() entrance`);
    this.unsplit();
    const visible = this.opacity() > 0 ? this.opacity() : 1;
    const split = splitText(this);
    if (split.pieces.length === 0) {
      split.restore(entrance ? 0 : visible);
      yield* this.opacity(entrance ? visible : 0, duration);
      return;
    }
    try {
      if (entrance) split.container.opacity(visible);
      yield* body(split, maxHeight(split));
    } finally {
      split.restore(entrance ? visible : 0);
    }
  }

  /** The height of the tallest glyph, measured without splitting. */
  private glyphHeight(): number {
    return this.textGlyphs().reduce(
      (max, unit) => Math.max(max, unit.height),
      0,
    );
  }

  /** Pieces appear within 0.15 seconds while moving into place. */
  private *motion(
    name: string,
    dy: (height: number) => number,
    duration: number,
    stagger: number,
    timingFunction: TimingFunction,
  ): ThreadGenerator {
    yield* this.animateSplit(name, duration, function* (split, h) {
      const {pieces, homes} = split;
      pieces.forEach((piece, i) => {
        piece.opacity(0);
        piece.position.y(homes[i].y + dy(h));
      });
      yield* sequence(
        stagger,
        ...pieces.map((piece, i) =>
          all(
            piece.opacity(1, 0.15),
            piece.position.y(homes[i].y, duration, timingFunction),
          ),
        ),
      );
    });
  }

  /** Pieces fade in while moving sideways by a tenth of their line. */
  private *fadeSideways(
    name: string,
    sign: number,
    duration: number,
    stagger: number,
    timingFunction: TimingFunction,
  ): ThreadGenerator {
    yield* this.animateSplit(name, duration, function* (split) {
      const {pieces, homes} = split;
      const widths = lineWidthsOf(split, 0);
      pieces.forEach((piece, i) => {
        piece.opacity(0);
        piece.position.x(
          homes[i].x + sign * widths[split.lineIndexOf(i)] * 0.1,
        );
      });
      yield* sequence(
        stagger,
        ...pieces.map((piece, i) =>
          all(
            piece.opacity(1, duration * 0.8, timingFunction),
            piece.position.x(homes[i].x, duration, timingFunction),
          ),
        ),
      );
    });
  }

  // ─── Entrances ────────────────────────────────────────────────

  /**
   * Show the characters one after another.
   *
   * @param _duration - Unused, kept for source compatibility.
   * @param stagger - The delay between characters.
   */
  @threadable()
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- VideoZero signature
  public *typewriter(_duration = 1.5, stagger = 0.04): ThreadGenerator {
    yield* this.delegate('typewriter', () => textTypewriter(this, {stagger}));
  }

  /**
   * Fade the characters in while they rise by 0.3 of the character height.
   */
  @threadable()
  public *fadeUp(
    duration = 0.5,
    stagger = 0.03,
    tf: TimingFunction = easeOutCubic,
  ): ThreadGenerator {
    yield* this.delegate('fadeUp', () =>
      textFadeIn(this, {
        direction: Direction.Top,
        distance: this.glyphHeight() * 0.3,
        duration,
        stagger,
        timingFunction: tf,
      }),
    );
  }

  /**
   * Fade the characters in while they drop by 0.3 of the character height.
   */
  @threadable()
  public *fadeDown(
    duration = 0.5,
    stagger = 0.03,
    tf: TimingFunction = easeOutCubic,
  ): ThreadGenerator {
    yield* this.delegate('fadeDown', () =>
      textFadeIn(this, {
        direction: Direction.Bottom,
        distance: this.glyphHeight() * 0.3,
        duration,
        stagger,
        timingFunction: tf,
      }),
    );
  }

  /**
   * Fade the characters in while they move left by a tenth of their line.
   */
  @threadable()
  public *fadeLeft(
    duration = 0.5,
    stagger = 0.03,
    tf: TimingFunction = easeOutCubic,
  ): ThreadGenerator {
    yield* this.fadeSideways('fadeLeft', 1, duration, stagger, tf);
  }

  /**
   * Fade the characters in while they move right by a tenth of their line.
   */
  @threadable()
  public *fadeRight(
    duration = 0.5,
    stagger = 0.03,
    tf: TimingFunction = easeOutCubic,
  ): ThreadGenerator {
    yield* this.fadeSideways('fadeRight', -1, duration, stagger, tf);
  }

  /**
   * Move the characters up by their height into place, appearing quickly.
   */
  @threadable()
  public *motionUp(
    duration = 0.5,
    stagger = 0.03,
    tf: TimingFunction = easeOutCubic,
  ): ThreadGenerator {
    yield* this.motion('motionUp', h => h, duration, stagger, tf);
  }

  /**
   * Move the characters down by their height into place, appearing quickly.
   */
  @threadable()
  public *motionDown(
    duration = 0.5,
    stagger = 0.03,
    tf: TimingFunction = easeOutCubic,
  ): ThreadGenerator {
    yield* this.motion('motionDown', h => -h, duration, stagger, tf);
  }

  /**
   * Grow the characters from nothing, overshooting slightly.
   */
  @threadable()
  public *scaleIn(
    duration = 0.5,
    stagger = 0.08,
    tf: TimingFunction = easeOutBack,
  ): ThreadGenerator {
    yield* this.delegate('scaleIn', () =>
      textScaleIn(this, {scale: 0, duration, stagger, timingFunction: tf}),
    );
  }

  /**
   * Drop the characters in from above by their height, overshooting.
   */
  @threadable()
  public *bounceIn(
    duration = 0.5,
    stagger = 0.03,
    tf: TimingFunction = easeOutBack,
  ): ThreadGenerator {
    yield* this.motion('bounceIn', h => -h, duration, stagger, tf);
  }

  private *reveal(
    name: string,
    direction: Direction,
    duration: number,
    tf: TimingFunction,
  ): ThreadGenerator {
    yield* this.delegate(name, () =>
      textRevealIn(this, {
        by: 'grapheme',
        direction,
        duration,
        stagger: 0,
        timingFunction: tf,
      }),
    );
  }

  /** Slide all characters up into place from behind their line. */
  @threadable()
  public *revealUp(
    duration = 0.6,
    tf: TimingFunction = easeOutCubic,
  ): ThreadGenerator {
    yield* this.reveal('revealUp', Direction.Top, duration, tf);
  }

  /** Slide all characters down into place from behind their line. */
  @threadable()
  public *revealDown(
    duration = 0.6,
    tf: TimingFunction = easeOutCubic,
  ): ThreadGenerator {
    yield* this.reveal('revealDown', Direction.Bottom, duration, tf);
  }

  /** Slide all characters left into place from behind their line. */
  @threadable()
  public *revealLeft(
    duration = 0.6,
    tf: TimingFunction = easeOutCubic,
  ): ThreadGenerator {
    yield* this.reveal('revealLeft', Direction.Left, duration, tf);
  }

  /** Slide all characters right into place from behind their line. */
  @threadable()
  public *revealRight(
    duration = 0.6,
    tf: TimingFunction = easeOutCubic,
  ): ThreadGenerator {
    yield* this.reveal('revealRight', Direction.Right, duration, tf);
  }

  /**
   * Fade the words in one after another, rising by 0.2 of their height.
   */
  @threadable()
  public *wordByWord(
    duration = 0.4,
    stagger = 0.1,
    tf: TimingFunction = easeOutCubic,
  ): ThreadGenerator {
    yield* this.animateSplit('wordByWord', duration, function* (split, h) {
      const {pieces, homes} = split;
      pieces.forEach((piece, i) => {
        piece.opacity(0);
        piece.position.y(homes[i].y + h * 0.2);
      });
      yield* sequence(
        stagger,
        ...groupWords(split).map(word =>
          all(
            ...word.map(piece => {
              const home = homes[pieces.indexOf(piece)];
              return all(
                piece.opacity(1, duration, tf),
                piece.position.y(home.y, duration, tf),
              );
            }),
          ),
        ),
      );
    });
  }

  /**
   * Slide the lines up into place from behind their line box, one after
   * another.
   */
  @threadable()
  public *lineByLine(
    duration = 0.5,
    stagger = 0.15,
    tf: TimingFunction = easeOutCubic,
  ): ThreadGenerator {
    yield* this.delegate('lineByLine', () =>
      textRevealIn(this, {
        by: 'line',
        direction: Direction.Top,
        duration,
        stagger,
        timingFunction: tf,
      }),
    );
  }

  /**
   * Fade the characters in while they close in on the middle of the text.
   *
   * @param duration - The duration of the animation.
   * @param spread - How far the characters start spread out, as a share of
   *                 their distance to the middle.
   * @param tf - The timing function.
   */
  @threadable()
  public *trackingIn(
    duration = 0.7,
    spread = 0.4,
    tf: TimingFunction = easeOutCubic,
  ): ThreadGenerator {
    yield* this.animateSplit('trackingIn', duration, function* (split) {
      const {pieces, homes} = split;
      const center =
        homes.reduce((sum, home) => sum + home.x, 0) / homes.length;
      pieces.forEach((piece, i) => {
        piece.opacity(0);
        piece.position.x(homes[i].x + (homes[i].x - center) * spread);
      });
      yield* all(
        ...pieces.map((piece, i) =>
          all(
            piece.opacity(1, duration * 0.7, tf),
            piece.position.x(homes[i].x, duration, tf),
          ),
        ),
      );
    });
  }

  /**
   * Fade the characters in on a settling wave.
   */
  @threadable()
  public *waveIn(
    duration = 2,
    tf: TimingFunction = easeOutCubic,
  ): ThreadGenerator {
    yield* this.animateSplit('waveIn', duration, function* (split, h) {
      const {pieces, homes} = split;
      pieces.forEach(piece => piece.opacity(0));
      yield* tween(duration, t => {
        const p = tf(t);
        pieces.forEach((piece, i) => {
          const cp = Math.max(0, Math.min(1, (p - i * 0.03) / 0.5));
          piece.opacity(Math.min(cp * 2, 1));
          piece.position.y(
            homes[i].y +
              Math.sin(p * Math.PI * 4 - i * 0.3) * h * 0.3 * (1 - p),
          );
        });
      });
      pieces.forEach((piece, i) => {
        piece.opacity(1);
        piece.position.y(homes[i].y);
      });
    });
  }

  /**
   * Spin and grow the characters in from half their size.
   */
  @threadable()
  public *rotateIn(
    duration = 0.5,
    stagger = 0.04,
    tf: TimingFunction = easeOutCubic,
  ): ThreadGenerator {
    yield* this.delegate('rotateIn', () =>
      textScaleIn(this, {
        scale: 0.5,
        rotation: 90,
        duration,
        stagger,
        timingFunction: tf,
      }),
    );
  }

  /**
   * Fade the characters in through random characters.
   *
   * @remarks
   * The characters come from the scene's random generator, so every render
   * shows the same ones (VideoZero used `Math.random`).
   */
  @threadable()
  public *scramble(
    duration = 2,
    tf: TimingFunction = easeOutCubic,
  ): ThreadGenerator {
    const random = useRandom();
    yield* this.animateSplit('scramble', duration, function* (split) {
      const {pieces} = split;
      const texts = pieces.map(piece => piece.text());
      pieces.forEach(piece => piece.opacity(0));
      yield* tween(duration, t => {
        const p = tf(t);
        pieces.forEach((piece, i) => {
          const cp = Math.max(0, Math.min(1, (p - i * 0.03) / 0.5));
          piece.opacity(Math.min(cp * 2, 1));
          if (cp > 0 && cp < 0.7) {
            piece.text(ScramblePool[random.nextInt(0, ScramblePool.length)]);
          } else if (cp >= 0.7) {
            piece.text(texts[i]);
          }
        });
      });
      pieces.forEach((piece, i) => piece.text(texts[i]));
    });
  }

  /**
   * Draw the characters as outlines, then fill them one after another.
   *
   * @param _duration - Unused, kept for source compatibility.
   * @param stagger - The delay between characters.
   */
  @threadable()
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- VideoZero signature
  public *outline(_duration = 0.5, stagger = 0.04): ThreadGenerator {
    yield* this.animateSplit('outline', 0.5, function* (split) {
      const {pieces} = split;
      const fills = pieces.map(piece => piece.fill());
      pieces.forEach((piece, i) => {
        piece.fill(null);
        piece.stroke(fills[i]);
        piece.lineWidth(1.5);
        piece.opacity(0);
      });
      yield* sequence(stagger, ...pieces.map(piece => piece.opacity(1, 0.2)));
      yield* sequence(
        stagger,
        ...pieces.map((piece, i) =>
          tween(0.3, t => {
            if (t < 0.5) {
              piece.opacity(1 - t * 0.6);
            } else {
              piece.fill(fills[i]);
              piece.stroke(null);
              piece.lineWidth(0);
              piece.opacity(0.7 + (t - 0.5) * 0.6);
            }
          }),
        ),
      );
    });
  }

  /**
   * Fade the characters in with a growing glow in their own color.
   *
   * @remarks
   * The glow stays: when the helper ends, the text gets a `shadowBlur` of
   * `20` in its fill color.
   */
  @threadable()
  public *neon(
    duration = 0.5,
    stagger = 0.06,
    tf: TimingFunction = easeOutSine,
  ): ThreadGenerator {
    const fill = this.fill();
    const color = fill instanceof Color ? fill : new Color('#ffffff');
    yield* this.animateSplit('neon', duration, function* (split) {
      const {pieces} = split;
      pieces.forEach(piece => {
        piece.opacity(0);
        piece.shadowColor(color);
        piece.shadowBlur(0);
      });
      yield* sequence(
        stagger,
        ...pieces.map(piece =>
          all(piece.opacity(1, 0.3), piece.shadowBlur(20, duration, tf)),
        ),
      );
    });
    this.shadowColor(color);
    this.shadowBlur(20);
  }

  /**
   * Fade the characters in with a soft drop shadow while they rise.
   *
   * @remarks
   * The shadow stays: when the helper ends, the text gets a `shadowBlur` of
   * `4` in `rgba(0,0,0,0.5)`.
   */
  @threadable()
  public *shadowIn(
    duration = 0.5,
    stagger = 0.03,
    tf: TimingFunction = easeOutCubic,
  ): ThreadGenerator {
    const color = 'rgba(0,0,0,0.5)';
    yield* this.animateSplit('shadowIn', duration, function* (split, h) {
      const {pieces, homes} = split;
      pieces.forEach((piece, i) => {
        piece.opacity(0);
        piece.position.y(homes[i].y + h * 0.4);
        piece.shadowColor(color);
        piece.shadowBlur(4);
      });
      yield* sequence(
        stagger,
        ...pieces.map((piece, i) =>
          all(
            piece.opacity(1, 0.3),
            piece.position.y(homes[i].y, duration, tf),
          ),
        ),
      );
    });
    this.shadowColor(color);
    this.shadowBlur(4);
  }

  // ─── Exits ────────────────────────────────────────────────────

  /** Fade all characters out at once. */
  @threadable()
  public *fadeOut(
    duration = 0.35,
    tf: TimingFunction = easeInCubic,
  ): ThreadGenerator {
    yield* this.delegate(null, () =>
      textFadeOut(this, {duration, timingFunction: tf}),
    );
  }

  /** Fade the characters out while they rise by 0.15 of their height. */
  @threadable()
  public *fadeOutUp(
    duration = 0.35,
    stagger = 0,
    tf: TimingFunction = easeInCubic,
  ): ThreadGenerator {
    yield* this.delegate(null, () =>
      textFadeOut(this, {
        direction: Direction.Top,
        distance: this.glyphHeight() * 0.15,
        duration,
        stagger,
        timingFunction: tf,
      }),
    );
  }

  /** Fade the characters out while they drop by 0.15 of their height. */
  @threadable()
  public *fadeOutDown(
    duration = 0.35,
    stagger = 0,
    tf: TimingFunction = easeInCubic,
  ): ThreadGenerator {
    yield* this.delegate(null, () =>
      textFadeOut(this, {
        direction: Direction.Bottom,
        distance: this.glyphHeight() * 0.15,
        duration,
        stagger,
        timingFunction: tf,
      }),
    );
  }

  /** Fade the characters out while they shrink to 0.8. */
  @threadable()
  public *scaleOut(
    duration = 0.3,
    tf: TimingFunction = easeInCubic,
  ): ThreadGenerator {
    yield* this.delegate(null, () =>
      textScaleOut(this, {scale: 0.8, duration, timingFunction: tf}),
    );
  }

  private *slideOut(sign: number, duration: number, tf: TimingFunction) {
    yield* this.animateSplit(null, duration, function* (split, h) {
      const {pieces, homes} = split;
      yield* all(
        ...pieces.map((piece, i) =>
          piece.position.y(homes[i].y + sign * h, duration, tf),
        ),
      );
    });
  }

  /**
   * Move the characters up by their height, then hide the text. Not clipped.
   */
  @threadable()
  public *revealOutUp(
    duration = 0.35,
    tf: TimingFunction = easeInCubic,
  ): ThreadGenerator {
    yield* this.slideOut(-1, duration, tf);
  }

  /**
   * Move the characters down by their height, then hide the text. Not
   * clipped.
   */
  @threadable()
  public *revealOutDown(
    duration = 0.35,
    tf: TimingFunction = easeInCubic,
  ): ThreadGenerator {
    yield* this.slideOut(1, duration, tf);
  }

  /**
   * Fade the characters out while they close in on the middle of the text.
   */
  @threadable()
  public *trackingOut(
    duration = 0.35,
    spread = 0.2,
    tf: TimingFunction = easeInCubic,
  ): ThreadGenerator {
    yield* this.animateSplit(null, duration, function* (split) {
      const {pieces, homes} = split;
      const center =
        homes.reduce((sum, home) => sum + home.x, 0) / homes.length;
      yield* all(
        ...pieces.map((piece, i) =>
          all(
            piece.opacity(0, duration, tf),
            piece.position.x(
              homes[i].x - (homes[i].x - center) * spread,
              duration,
              tf,
            ),
          ),
        ),
      );
    });
  }

  /**
   * Fade the characters out quickly while they rise by their height, to make
   * room for the next text.
   */
  @threadable()
  public *swapOut(
    duration = 0.3,
    tf: TimingFunction = easeInCubic,
  ): ThreadGenerator {
    yield* this.animateSplit(null, duration, function* (split, h) {
      const {pieces, homes} = split;
      yield* all(
        ...pieces.map((piece, i) =>
          all(
            piece.opacity(0, duration * 0.8, tf),
            piece.position.y(homes[i].y - h, duration, tf),
          ),
        ),
      );
    });
  }
}

// VideoZero's `Txt.defaultSmooth` lives on `AnimTxt`: assigning it here must
// change the one setting `Txt` reads, not shadow it.
Object.defineProperty(AnimTxt, 'defaultSmooth', {
  get: () => Txt.defaultSmooth,
  set: (value: boolean) => {
    Txt.defaultSmooth = value;
  },
});
