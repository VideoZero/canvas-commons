import {
  ComponentChildren,
  Layout,
  Length,
  Node,
  TextSplit,
  Txt,
  TxtProps,
  getTextSplit,
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
  SimpleSignal,
  ThreadGenerator,
  TimingFunction,
  all,
  easeInCubic,
  easeOutBack,
  easeOutCubic,
  easeOutSine,
  isReactive,
  map,
  sequence,
  threadable,
  tween,
  useRandom,
} from '@canvas-commons/core';
import {
  VideoZeroFontFamily,
  resolveVideoZeroFontFamily,
  videoZeroFonts,
} from './fonts';

const ScramblePool =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%&*';

type SplitBody = (split: TextSplit, height: number) => ThreadGenerator;

type TextLeaf = Node & {text: SimpleSignal<string, Node>};

function mapValue<T>(value: SignalValue<T>, fn: (value: T) => T) {
  return isReactive(value) ? () => fn(value()) : fn(value);
}

/** The literal two characters `\n` read as a line break, as in VideoZero. */
function unescapeNewlines(text: string): string {
  return AnimTxt.escapedNewlines && typeof text === 'string'
    ? text.replace(/\\n/g, '\n')
    : text;
}

/** A small numeric line height read as a multiplier, as in VideoZero. */
function multiplierLineHeight(value: Length): Length {
  const limit = AnimTxt.lineHeightMultiplierLimit;
  if (typeof value !== 'number' || limit === null || value > limit) {
    return value;
  }
  return `${Math.round(value * 1e6) / 1e4}%`;
}

/** The line height as a percentage of the given font size. */
function lineHeightPercent(value: Length, fontSize: number): number {
  if (typeof value === 'string') return parseFloat(value);
  return fontSize > 0 ? (value / fontSize) * 100 : 0;
}

function isTextLeaf(node: Node): node is TextLeaf {
  return !(node instanceof Layout) && 'text' in node;
}

/** The layout a node inherits its font from, as `Layout` resolves it. */
function layoutParentOf(node: Node): Layout | null {
  const view = node.view();
  for (let parent = node.parent(); parent; parent = parent.parent()) {
    if (parent.view() !== view) return null;
    if (parent instanceof Layout) return parent;
  }
  return null;
}

/**
 * The `fontFamily` a node gets from the nearest ancestor that sets one, or
 * `null` when no ancestor along the inheritance chain sets one.
 */
function inheritedFontFamily(node: Layout): string | null {
  for (let current = node; current.layout() !== false;) {
    const parent = layoutParentOf(current);
    if (!parent) return null;
    // Reading the value first lets a later change of it reach this node.
    const family = parent.fontFamily();
    if (parent instanceof AnimTxt || !parent.fontFamily.isInitial()) {
      return family;
    }
    current = parent;
  }
  return null;
}

/** The default `fontFamily` the `defaultStyle` decorator gives `Layout`. */
const LayoutFontDefault = Layout.prototype as unknown as {
  getDefaultFontFamily(this: Layout): string;
};

const Adopted = new WeakSet<Node>();

/**
 * Give a plain text nested in an `AnimTxt` the VideoZero reading of its
 * text, `fontFamily` and `lineHeight` as they are when it is added.
 */
function adoptNested(node: Node) {
  if (node instanceof AnimTxt || Adopted.has(node)) return;
  Adopted.add(node);
  if (isTextLeaf(node)) {
    const raw = node.text.context.raw();
    if (raw !== undefined) node.text(mapValue(raw, unescapeNewlines));
    return;
  }
  if (!(node instanceof Txt)) return;
  const family = node.fontFamily.context.raw();
  if (!node.fontFamily.isInitial() && family !== undefined) {
    node.fontFamily(mapValue(family, resolveVideoZeroFontFamily));
  }
  const lineHeight = node.lineHeight.context.raw();
  if (!node.lineHeight.isInitial() && lineHeight !== undefined) {
    node.lineHeight(mapValue(lineHeight, multiplierLineHeight));
  }
  node.children().forEach(adoptNested);
}

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
 * standalone piece per grapheme and the pieces are animated in the source's
 * place. As in VideoZero, entrances leave the text split, so it keeps looking
 * exactly like the last frame of the entrance (ligatures and kerning don't
 * jump) and {@link chars} can be animated further; {@link unsplit} draws the
 * source again. Exits animate the pieces of an earlier split and end with the
 * split removed and the source at opacity `0`. A canceled helper removes its
 * split.
 *
 * The pieces follow the text's style (`followStyle`), so tweening its
 * `fill`, `fontWeight` and the like during a helper or while it stays split
 * reaches them, unless a value was set on a piece itself.
 *
 * Create the text with `opacity={0}` before an entrance, otherwise it's
 * visible from the start; `Node.warnVisibleBeforeEntrance` reports this.
 *
 * `AnimTxt` keeps the defensive defaults VideoZero had for generated scenes,
 * for itself and the plain text nested in it: a literal `\n` is a line break
 * ({@link AnimTxt.escapedNewlines}), a numeric `lineHeight` up to `4` is a
 * multiplier ({@link AnimTxt.lineHeightMultiplierLimit}), `lineJoin` is round
 * ({@link AnimTxt.defaultLineJoin}), text without a font uses the Inter stack
 * ({@link AnimTxt.defaultFontFamily}), and `fontFamily` resolves the names of
 * {@link AnimTxt.fonts}.
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
   * The `lineJoin` an `AnimTxt` and the text nested in it use when none is
   * set on it or on a parent text: `'round'`, as in VideoZero. `null` keeps
   * the Canvas Commons default (`'miter'`).
   *
   * @example
   * ```ts
   * AnimTxt.defaultLineJoin = null;
   * ```
   */
  public static defaultLineJoin: CanvasLineJoin | null = 'round';

  /**
   * The `fontFamily` of an `AnimTxt` that neither sets one nor gets one from
   * an ancestor: VideoZero's Inter stack. `null` keeps the Canvas Commons
   * default (`'Roboto'`).
   *
   * @remarks
   * Unlike a font set on the view, it also reaches text inside containers
   * with `layout={false}`, which don't inherit fonts from their parents.
   *
   * @example
   * ```ts
   * AnimTxt.defaultFontFamily = '"Source Sans 3", sans-serif';
   * ```
   */
  public static defaultFontFamily: string | null = VideoZeroFontFamily;

  /**
   * Whether the literal two characters backslash and `n` in the text of an
   * `AnimTxt` (and of text nested in it) are a line break, as in VideoZero.
   * Code generators and unparsed JSON often write them instead of a real
   * newline. On by default.
   *
   * @example
   * ```tsx
   * <AnimTxt text={'First line\\nSecond line'} />; // two lines
   * ```
   */
  public static escapedNewlines = true;

  /**
   * A numeric `lineHeight` up to this value is a multiplier of the font size,
   * as in VideoZero: `lineHeight={1.2}` is `'120%'`. Larger numbers are
   * pixels. `null` reads every number as pixels, like Canvas Commons.
   * Defaults to `4`.
   *
   * @example
   * ```tsx
   * <AnimTxt lineHeight={1.4} text="Loose lines" />; // '140%'
   * ```
   */
  public static lineHeightMultiplierLimit: number | null = 4;

  /**
   * Semantic font names, VideoZero's `Txt.fonts`: a `fontFamily` set to one
   * of the keys draws with its stack.
   *
   * @remarks
   * Extend it at app start. The `fontFamily` of an `AnimTxt`, and of plain
   * text nested in it, resolves through {@link resolveVideoZeroFontFamily}:
   * a registered name gives its stack, stacks, generic families and
   * capitalized names are kept, and other names warn once.
   *
   * @example
   * ```tsx
   * AnimTxt.fonts.warmPlayful = '"Fraunces", serif';
   * Object.assign(AnimTxt.fonts, {mono: '"JetBrains Mono", monospace'});
   *
   * <AnimTxt fontFamily="warmPlayful" text="Hello" />;
   * ```
   */
  public static readonly fonts: Record<string, string> = videoZeroFonts;

  public constructor(props: TxtProps) {
    super(props);
  }

  /**
   * Whether the text is currently split, by an entrance or by
   * {@link splitChars}.
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

  private get splitState(): TextSplit | null {
    return getTextSplit(this);
  }

  private get splitPadding(): number {
    return this.splitState?.clip ? this.splitState.clipPadding : 0;
  }

  /**
   * The character pieces of the current split, in reading order: the ones
   * of the last entrance, or the ones created by {@link splitChars}.
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
   * pieces. A split left by an entrance is replaced.
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
    splitText(this, {by: 'grapheme', clip, clipPadding, followStyle: true});
    return this;
  }

  /**
   * Remove the pieces of the current split, left by an entrance or created by
   * {@link splitChars}, and show the text again.
   *
   * @remarks
   * The text is shown at the opacity its pieces were drawn with.
   */
  public unsplit(): this {
    this.splitState?.restore();
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
    value = mapValue(value, unescapeNewlines);
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
    yield* super.tweenText(
      mapValue(value, unescapeNewlines),
      time,
      timingFunction,
      interpolationFunction,
    );
  }

  protected override parseChildren(children: ComponentChildren): Node[] {
    const array = Array.isArray(children) ? children : [children];
    const nodes = super.parseChildren(
      array.map(child =>
        typeof child === 'string' ? unescapeNewlines(child) : child,
      ),
    );
    nodes.forEach(adoptNested);
    return nodes;
  }

  protected getFontFamily(): string {
    return resolveVideoZeroFontFamily(this.fontFamily.context.getter());
  }

  protected getDefaultFontFamily(): string {
    if (AnimTxt.defaultFontFamily === null) {
      return LayoutFontDefault.getDefaultFontFamily.call(this);
    }
    return inheritedFontFamily(this) ?? AnimTxt.defaultFontFamily;
  }

  protected getLineHeight(): Length {
    return multiplierLineHeight(this.lineHeight.context.getter());
  }

  /**
   * Tweens the line height as a percentage of the font size, so multipliers,
   * percentages and pixels mix.
   */
  @threadable()
  protected *tweenLineHeight(
    value: SignalValue<Length>,
    time: number,
    timingFunction: TimingFunction,
  ): ThreadGenerator {
    const from = this.lineHeight();
    const to = multiplierLineHeight(isReactive(value) ? value() : value);
    yield* tween(time, t => {
      const size = this.effectiveFontSize();
      const percent = map(
        lineHeightPercent(from, size),
        lineHeightPercent(to, size),
        timingFunction(t),
      );
      this.lineHeight.context.setter(`${percent}%`);
    });
    this.lineHeight.context.setter(value);
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

  /**
   * Starts a helper built on a Canvas Commons text animation, which replaces
   * the current split for an entrance and reuses it for an exit when it was
   * cut the same way.
   */
  private *delegate(
    entrance: string | null,
    animation: () => ThreadGenerator,
  ): ThreadGenerator {
    if (entrance) this.warnVisibleBeforeEntrance(`${entrance}() entrance`);
    yield* animation();
  }

  /**
   * Run a helper on a split of the text. An entrance splits the text anew
   * and leaves the split in place when it ends; an exit animates the current
   * split, if any, and removes it when it ends. A canceled helper removes the
   * split.
   */
  private *animateSplit(
    entrance: string | null,
    duration: number,
    body: SplitBody,
    clip = false,
  ): ThreadGenerator {
    if (entrance) this.warnVisibleBeforeEntrance(`${entrance}() entrance`);
    let split = entrance ? null : this.splitState;
    let visible = 1;
    if (!split) {
      this.unsplit();
      visible = this.opacity() > 0 ? this.opacity() : 1;
      split = splitText(this, {by: 'grapheme', clip, followStyle: true});
    }
    if (split.pieces.length === 0) {
      split.restore(entrance ? 0 : visible);
      yield* this.opacity(entrance ? visible : 0, duration);
      return;
    }
    let keep = false;
    try {
      if (entrance) split.container.opacity(visible);
      yield* body(split, maxHeight(split));
      keep = entrance !== null;
    } finally {
      if (!keep) split.restore(entrance ? visible : 0);
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
    yield* this.delegate('typewriter', () =>
      textTypewriter(this, {stagger, followStyle: true}),
    );
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
        followStyle: true,
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
        followStyle: true,
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
      textScaleIn(this, {
        followStyle: true,
        scale: 0,
        duration,
        stagger,
        timingFunction: tf,
      }),
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
        followStyle: true,
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
    yield* this.animateSplit(
      'lineByLine',
      duration,
      function* (split, h) {
        const {pieces, homes, lines} = split;
        pieces.forEach((piece, i) => piece.position.y(homes[i].y + h));
        yield* sequence(
          stagger,
          ...lines.map(line =>
            all(
              ...line.map(piece =>
                piece.position.y(homes[pieces.indexOf(piece)].y, duration, tf),
              ),
            ),
          ),
        );
      },
      true,
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
        followStyle: true,
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
      // The raw values keep the pieces bound to the source's fill.
      const fills = pieces.map(piece => piece.fill.context.raw() ?? null);
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
      textFadeOut(this, {
        followStyle: true,
        duration,
        timingFunction: tf,
      }),
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
        followStyle: true,
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
        followStyle: true,
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
      textScaleOut(this, {
        followStyle: true,
        scale: 0.8,
        duration,
        timingFunction: tf,
      }),
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
