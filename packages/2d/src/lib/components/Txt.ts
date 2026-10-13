import {
  DEFAULT,
  InterpolationFunction,
  SignalValue,
  SimpleSignal,
  ThreadGenerator,
  TimingFunction,
  all,
  capitalize,
  easeInCubic,
  easeOutBack,
  easeOutCubic,
  easeOutSine,
  sequence,
  threadable,
  tween,
} from '@motion-canvas/core';
import {computed, initial, nodeName, signal} from '../decorators';
import {fontRegistry, resolveFontFamily} from '../text/fontRegistry';
import {getMeasureContext} from '../text/measureContext';
import {is} from '../utils';
import {Layout} from './Layout';
import {Node} from './Node';
import {Shape, ShapeProps} from './Shape';
import {TxtChar, TxtLeaf} from './TxtLeaf';
import {ComponentChildren} from './types';

type TxtChildren = string | Node | (string | Node)[];
type AnyTxt = Txt | TxtLeaf;

/**
 * Which part of the text is centered on the node's position.
 *
 * - `'line'` - the CSS line box (font ascent + descent). Fonts with uneven
 *   metrics make the glyphs sit visibly high or low.
 * - `'cap'` - the band from cap height to baseline. Depends only on the font,
 *   so it stays put while the text changes. Text without Latin, Greek or
 *   Cyrillic letters or digits has no caps to measure and uses `'ink'`.
 * - `'ink'` - the glyphs actually drawn, measured for the current text. Use it
 *   for numbers in fonts with old-style figures; it moves when the text does.
 */
export type TextCenter = 'line' | 'cap' | 'ink';

// Scripts that have capital letters to measure; other text centers on its ink.
const CapScripts = /[\p{Script=Latin}\p{Script=Greek}\p{Script=Cyrillic}0-9]/u;

// Cap metrics per loaded font; measuring is the costly part of the offset.
const CapMetrics = new Map<string, TextMetrics>();

function isFontLoaded(font: string) {
  try {
    return document.fonts?.check(font) ?? true;
  } catch {
    // An invalid shorthand; the browser ignores it as well.
    return true;
  }
}

export interface TxtProps extends ShapeProps {
  children?: TxtChildren;
  text?: SignalValue<string>;
  textCenter?: SignalValue<TextCenter | null>;
}

@nodeName('Txt')
export class Txt extends Shape {
  /**
   * Registry of semantic font names → CSS font-family strings.
   *
   * Set or extend this map at app start to give scenes brand-named fonts:
   *
   * ```ts
   * Txt.fonts.warmPlayful = '"Fraunces", serif';
   * Txt.fonts.body = '"Inter", "Noto Sans", "Noto Sans SC", sans-serif';
   * // or bulk assign:
   * Object.assign(Txt.fonts, { warmFormal: '"Lora", serif', mono: '"JetBrains Mono", monospace' });
   * ```
   *
   * Then in a scene:
   *
   * ```tsx
   * <Txt fontFamily="warmPlayful" text="Hello" />
   * ```
   *
   * `fontFamily` resolves in this order: exact registry match, then literal
   * pass-through for font stacks (containing `,`, `(`, or starting with a
   * quote), CSS generics (`serif` etc.), and capitalised family names
   * (`Arial`, `Times New Roman`). Lowercase keys missing from the registry
   * log a one-time console warning.
   */
  public static readonly fonts: Record<string, string> = fontRegistry;

  /**
   * Create a bold text node.
   *
   * @remarks
   * This is a shortcut for
   * ```tsx
   * <Txt fontWeight={700} />
   * ```
   *
   * @param props - Additional text properties.
   */
  public static b(props: TxtProps) {
    return new Txt({...props, fontWeight: 700});
  }

  /**
   * Create an italic text node.
   *
   * @remarks
   * This is a shortcut for
   * ```tsx
   * <Txt fontStyle={'italic'} />
   * ```
   *
   * @param props - Additional text properties.
   */
  public static i(props: TxtProps) {
    return new Txt({...props, fontStyle: 'italic'});
  }

  @initial('')
  @signal()
  public declare readonly text: SimpleSignal<string, this>;

  // Text outlines should use round joins by default — miter spikes on sharp
  // glyph corners (overrides Shape's 'miter' default for text only).
  @initial('round')
  @signal()
  public declare readonly lineJoin: SimpleSignal<CanvasLineJoin, this>;

  /**
   * Default for {@link textCenter} on text nodes that don't set it.
   *
   * @remarks
   * Set to `'line'` to restore the original Motion Canvas placement:
   * ```ts
   * Txt.defaultTextCenter = 'line';
   * ```
   */
  public static defaultTextCenter: TextCenter = 'cap';

  /**
   * Which part of the text is centered on the node's position.
   *
   * @remarks
   * Only the drawn glyphs move: the layout box keeps its size, so stacks and
   * paddings are unaffected. Nested text follows the outermost `Txt`, and
   * baseline-aligned siblings (`alignItems`/`alignSelf: 'baseline'`) all move
   * with the largest of them, so their baselines stay aligned.
   * See {@link TextCenter} for the modes; `null` uses
   * {@link Txt.defaultTextCenter}.
   *
   * The metrics come from the outermost `Txt` (or the largest baseline
   * sibling), so a much larger inline child, or a baseline sibling wrapped in
   * another node, isn't accounted for.
   */
  @initial(null)
  @signal()
  public declare readonly textCenter: SimpleSignal<TextCenter | null, this>;

  /**
   * The vertical offset added to the glyphs to apply {@link textCenter}, in
   * local pixels.
   */
  @computed()
  public textCenterOffset(): number {
    const parentTxt = this.parentTxt();
    if (parentTxt) {
      return parentTxt.textCenterOffset();
    }

    if (this.isBaselineAligned()) {
      // Baseline-aligned siblings share one offset so their baselines stay
      // aligned: the one of the largest text, which dominates the row.
      let leader: Txt = this;
      for (const sibling of this.parent()!.children()) {
        if (
          sibling instanceof Txt &&
          sibling.isBaselineAligned() &&
          sibling.fontSize() > leader.fontSize()
        ) {
          leader = sibling;
        }
      }
      return leader.ownTextCenterOffset();
    }

    return this.ownTextCenterOffset();
  }

  @computed()
  protected ownTextCenterOffset(): number {
    let mode = this.textCenter() ?? Txt.defaultTextCenter;
    if (mode === 'line' || typeof document === 'undefined') {
      return 0;
    }

    const measureContext = getMeasureContext();
    if (!measureContext) {
      return 0;
    }

    // Read the leaf text directly: `text()` returns a plain field while split,
    // which would drop the dependency.
    const text = this.innerText().replace(/\s+/g, ' ');
    if (mode === 'cap' && !CapScripts.test(text)) {
      mode = 'ink';
    }

    // Depend on the font being loaded: applyFont() collects the load promise
    // (including fonts declared later by a font resolver) and is invalidated
    // when it settles.
    this.applyFont();
    const font = `${this.fontStyle()} ${this.fontWeight()} ${this.fontSize()}px ${resolveFontFamily(this.fontFamily())}`;
    let metrics = mode === 'cap' ? CapMetrics.get(font) : undefined;
    if (!metrics) {
      measureContext.font = font;
      metrics = measureContext.measureText(mode === 'ink' ? text : 'H');
      if (
        mode === 'ink' &&
        metrics.actualBoundingBoxAscent + metrics.actualBoundingBoxDescent <= 0
      ) {
        mode = 'cap';
        metrics = measureContext.measureText('H');
      }
      if (mode === 'cap' && isFontLoaded(font)) {
        CapMetrics.set(font, metrics);
      }
    }

    const ascent = metrics.actualBoundingBoxAscent;
    const descent = mode === 'cap' ? 0 : metrics.actualBoundingBoxDescent;
    // The line box is centered on (fontAscent - fontDescent) / 2 above the
    // baseline whatever the line height and line count; move the glyphs so
    // that the chosen band is centered there instead.
    const offset =
      (ascent -
        descent -
        metrics.fontBoundingBoxAscent +
        metrics.fontBoundingBoxDescent) /
      2;
    return Number.isFinite(offset) ? offset : 0;
  }

  private isBaselineAligned() {
    const parent = this.parent();
    if (!(parent instanceof Layout) || this.isLayoutRoot()) {
      return false;
    }
    const alignSelf = this.alignSelf() as string;
    return (
      alignSelf === 'baseline' ||
      (alignSelf === 'auto' && parent.alignItems() === 'baseline')
    );
  }

  protected getText(): string {
    if (this.splitOriginalText !== null) {
      return this.splitOriginalText;
    }
    return this.innerText();
  }

  protected setText(value: SignalValue<string>) {
    // New text is new content: count the node as shown from now on (empty
    // text draws nothing, and a swap is usually followed by an entrance).
    if (
      Node.warnVisibleBeforeEntrance &&
      this.parent() &&
      (typeof value === 'function' ? value() : value) !== this.text()
    ) {
      Node.markAttached(this);
    }
    // A split node keeps drawing the TxtChars created for the OLD string —
    // drop them so the next entrance animation re-splits the new text.
    if (this.isSplit) this.unsplit();
    const children = this.children();
    let leaf: TxtLeaf | null = null;
    for (let i = 0; i < children.length; i++) {
      const child = children[i];
      if (leaf === null && child instanceof TxtLeaf) {
        leaf = child;
      } else {
        child.parent(null);
      }
    }

    if (leaf === null) {
      leaf = new TxtLeaf({text: value});
      leaf.parent(this);
    } else {
      leaf.text(value);
    }

    this.setParsedChildren([leaf]);

    // Re-apply smoothing whenever the text changes — a freshly created leaf
    // (above) would otherwise default to smoothing off, so the rotation trick
    // only ever applied after an explicit split().
    if (this.smooth) {
      this.enableSmooth();
    }
  }

  protected override setChildren(value: SignalValue<ComponentChildren>) {
    if (this.children.context.raw() === value) {
      return;
    }

    if (typeof value === 'string') {
      this.text(value);
    } else {
      super.setChildren(value);
    }
  }

  @threadable()
  protected *tweenText(
    value: SignalValue<string>,
    time: number,
    timingFunction: TimingFunction,
    interpolationFunction: InterpolationFunction<string>,
  ): ThreadGenerator {
    if (this.isSplit) this.unsplit();
    const children = this.children();
    if (children.length !== 1 || !(children[0] instanceof TxtLeaf)) {
      this.text.save();
    }

    const leaf = this.childAs<TxtLeaf>(0)!;
    const oldText = leaf.text.context.raw();
    const oldSize = this.size.context.raw();
    leaf.text(value);
    const newSize = this.size();
    leaf.text(oldText ?? DEFAULT);

    const oldHeight = this.height();
    if (oldHeight === 0) {
      this.height(newSize.height);
    } else if (newSize.height === 0) {
      newSize.height = oldHeight;
    }

    yield* all(
      this.size(newSize, time, timingFunction),
      leaf.text(value, time, timingFunction, interpolationFunction),
    );

    this.children.context.setter(value);
    this.size(oldSize);
  }

  protected getLayout(): boolean {
    return true;
  }

  public constructor({children, text, ...props}: TxtProps) {
    super(props);
    this.children(text ?? children);
  }

  @computed()
  protected innerText(): string {
    let text = '';
    for (const child of this.children()) {
      if (child instanceof Txt || child instanceof TxtLeaf) {
        text += child.text();
      }
    }
    return text;
  }

  @computed()
  protected parentTxt() {
    const parent = this.parent();
    return parent instanceof Txt ? parent : null;
  }

  protected override parseChildren(children: ComponentChildren): AnyTxt[] {
    const result: AnyTxt[] = [];
    const array = Array.isArray(children) ? children : [children];
    for (const child of array) {
      if (child instanceof Txt || child instanceof TxtLeaf) {
        result.push(child);
      } else if (typeof child === 'string') {
        result.push(new TxtLeaf({text: child}));
      }
    }

    return result;
  }

  protected override applyFlex() {
    super.applyFlex();
    this.element.style.display = this.findAncestor(is(Txt))
      ? 'inline'
      : 'block';
    // The paragraph direction: which side `start`/`end` align to and how the
    // bidi algorithm orders the lines. The leaves follow it too.
    const direction = this.textDirection();
    this.element.style.direction = direction === 'inherit' ? '' : direction;
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Split text — per-character animation support
  //
  // TxtLeaf owns the per-character measurement and rendering.
  // Txt coordinates split/unsplit across all TxtLeaf descendants
  // and provides aggregated access to characters, words, and lines.
  // ═══════════════════════════════════════════════════════════════════════

  protected isSplit = false;
  protected splitOriginalText: string | null = null;

  /**
   * Default value for {@link smooth} on newly created text nodes.
   *
   * @remarks
   * Set this once at app start to flip smoothing on/off globally:
   * ```ts
   * Txt.defaultSmooth = false;
   * ```
   */
  public static defaultSmooth = true;

  /**
   * Whether to enable sub-pixel smoothing on this text.
   *
   * @remarks
   * When `true`, a tiny rotation (0.001 rad) is applied when rendering
   * to disable canvas pixel-grid snapping. This smooths the glyph edges
   * (grayscale anti-aliasing instead of hinted rendering) and prevents
   * wobble during vertical animation. Applies both to normal text and to
   * split characters. Initialised from {@link Txt.defaultSmooth}.
   */
  public smooth = Txt.defaultSmooth;

  /**
   * All TxtChar states, aggregated from all TxtLeaf descendants.
   * Populated by {@link split}.
   */
  public chars: TxtChar[] = [];

  /**
   * All words, aggregated from all TxtLeaf descendants.
   * Populated by {@link split}.
   */
  public words: TxtChar[][] = [];

  /**
   * Maximum character height across all TxtLeaf descendants.
   * Populated by {@link split}.
   */
  public maxCharHeight = 0;

  /**
   * Per-line widths, aggregated from all TxtLeaf descendants.
   * Populated by {@link split}.
   */
  public lineWidths: number[] = [];

  /**
   * Split text into individually-animatable characters.
   *
   * @remarks
   * Activates split mode on all TxtLeaf descendants. Each leaf
   * measures its characters from the DOM and creates TxtChar
   * states for per-character rendering.
   */
  public split(clip = false, clipPadding = 4): this {
    if (this.isSplit) this.unsplit();
    this.splitOriginalText = this.innerText();
    this.forEachLeaf(this, leaf => {
      leaf.splitIntoChars(clip, clipPadding);
    });
    // Aggregate from all TxtLeaf descendants
    this.chars = [];
    this.words = [];
    this.maxCharHeight = 0;
    this.lineWidths = [];
    this.forEachLeaf(this, leaf => {
      this.chars.push(...leaf.charStates);
      this.words.push(...leaf.leafWords());
      this.maxCharHeight = Math.max(this.maxCharHeight, leaf.leafMaxCharHeight());
      this.lineWidths.push(...leaf.leafLineWidths());
    });
    if (this.smooth) this.enableSmooth();
    this.isSplit = true;
    return this;
  }

  /**
   * Revert to normal text rendering.
   */
  public unsplit(): this {
    if (!this.isSplit) return this;
    this.forEachLeaf(this, leaf => {
      leaf.unsplitChars();
    });
    this.chars = [];
    this.words = [];
    this.maxCharHeight = 0;
    this.lineWidths = [];
    this.splitOriginalText = null;
    this.isSplit = false;
    return this;
  }

  public saveY(): number[] {
    return this.chars.map(c => c.position.y());
  }

  public saveX(): number[] {
    return this.chars.map(c => c.position.x());
  }

  public lineChars(lineIndex: number): TxtChar[] {
    let offset = 0;
    const leaves: TxtLeaf[] = [];
    this.forEachLeaf(this, leaf => leaves.push(leaf));
    for (const leaf of leaves) {
      const lineInfos = leaf.leafLineInfos();
      if (lineIndex < offset + lineInfos.length) {
        const localLine = lineIndex - offset;
        return lineInfos[localLine].charIndices.map(
          i => leaf.charStates[i],
        );
      }
      offset += lineInfos.length;
    }
    return [];
  }

  protected charLineIndex(charIdx: number): number {
    let charOffset = 0;
    let lineOffset = 0;
    const leaves: TxtLeaf[] = [];
    this.forEachLeaf(this, leaf => leaves.push(leaf));
    for (const leaf of leaves) {
      const localIdx = charIdx - charOffset;
      const lineInfos = leaf.leafLineInfos();
      if (localIdx >= 0 && localIdx < leaf.charStates.length) {
        for (let li = 0; li < lineInfos.length; li++) {
          if (lineInfos[li].charIndices.includes(localIdx)) {
            return lineOffset + li;
          }
        }
      }
      charOffset += leaf.charStates.length;
      lineOffset += lineInfos.length;
    }
    return -1;
  }

  public enableSmooth(): this {
    this.forEachLeaf(this, leaf => leaf.enableSmooth());
    return this;
  }

  public disableSmooth(): this {
    this.forEachLeaf(this, leaf => leaf.disableSmooth());
    return this;
  }

  /**
   * Split for an entrance animation.
   *
   * @remarks
   * Always re-splits so that detached char positions, leftover
   * scale/rotation/shadow/stroke state and the clip mode of a previous
   * animation never leak into this one.
   */
  private prepare(entrance: string, clip = false) {
    if (Node.warnVisibleBeforeEntrance) {
      this.warnVisibleBeforeEntrance(`${entrance}() entrance`);
    }
    this.split(clip);
    this.opacity(1);
  }

  private prepareClipped(entrance: string) {
    this.prepare(entrance, true);
  }

  /** Exit animations need chars too — split if the node was shown without a helper. */
  private prepareExit() {
    if (!this.isSplit) this.split();
  }

  // ─── Private helpers ──────────────────────────────────────────

  private forEachLeaf(node: Node, fn: (leaf: TxtLeaf) => void) {
    for (const child of node.children()) {
      if (child instanceof TxtLeaf) {
        fn(child);
      } else if (child instanceof Txt) {
        // Nested Txt — recurse into its children
        this.forEachLeaf(child, fn);
      }
    }
  }


  // ═══════════════════════════════════════════════════════════════════════
  // Drawing
  // ═══════════════════════════════════════════════════════════════════════

  protected override draw(context: CanvasRenderingContext2D) {
    this.drawChildren(context);
  }

  protected override warnVisibleBeforeEntrance(via: string, suffix = '') {
    // Split text draws per-character states that the helpers show and hide;
    // empty text draws nothing.
    if (this.isSplit || !this.innerText().trim()) return;
    super.warnVisibleBeforeEntrance(via, suffix);
  }

  protected override warningLabel(): string {
    const text = this.innerText().replace(/\s+/g, ' ').trim();
    const snippet =
      text.length > 24 ? `${text.slice(0, 21).trimEnd()}\u2026` : text;
    return `${super.warningLabel()} "${snippet}"`;
  }

  // ─── Entrance Animations ──────────────────────────────────────
  //
  // Entrance helpers don't hide the node before they run: create it with
  // `opacity={0}` (or add it right before the entrance), otherwise it's
  // visible from the start and flashes. `Node.warnVisibleBeforeEntrance`
  // reports this in validation runs.

  @threadable()
  public *typewriter(_duration = 1.5, stagger = 0.04): ThreadGenerator {
    this.prepare('typewriter');
    this.chars.forEach(c => c.opacity(0));
    yield* sequence(stagger, ...this.chars.map(c => c.opacity(1, 0)));
  }

  @threadable()
  public *fadeUp(duration = 0.5, stagger = 0.03, tf: TimingFunction = easeOutCubic): ThreadGenerator {
    this.prepare('fadeUp');
    const origY = this.saveY();
    const h = this.maxCharHeight;
    this.chars.forEach((c, i) => { c.opacity(0); c.position.y(origY[i] + h * 0.3); });
    yield* sequence(stagger, ...this.chars.map((c, i) =>
        all(c.opacity(1, duration * 0.8, tf), c.position.y(origY[i], duration, tf)),
    ));
  }

  @threadable()
  public *fadeDown(duration = 0.5, stagger = 0.03, tf: TimingFunction = easeOutCubic): ThreadGenerator {
    this.prepare('fadeDown');
    const origY = this.saveY();
    const h = this.maxCharHeight;
    this.chars.forEach((c, i) => { c.opacity(0); c.position.y(origY[i] - h * 0.3); });
    yield* sequence(stagger, ...this.chars.map((c, i) =>
        all(c.opacity(1, duration * 0.8, tf), c.position.y(origY[i], duration, tf)),
    ));
  }

  @threadable()
  public *fadeLeft(duration = 0.5, stagger = 0.03, tf: TimingFunction = easeOutCubic): ThreadGenerator {
    this.prepare('fadeLeft');
    const origX = this.saveX();
    this.chars.forEach((c, i) => {
      c.opacity(0);
      const li = this.charLineIndex(i);
      const w = li >= 0 ? this.lineWidths[li] : this.lineWidths[0];
      c.position.x(origX[i] + w * 0.1);
    });
    yield* sequence(stagger, ...this.chars.map((c, i) =>
        all(c.opacity(1, duration * 0.8, tf), c.position.x(origX[i], duration, tf)),
    ));
  }

  @threadable()
  public *fadeRight(duration = 0.5, stagger = 0.03, tf: TimingFunction = easeOutCubic): ThreadGenerator {
    this.prepare('fadeRight');
    const origX = this.saveX();
    this.chars.forEach((c, i) => {
      c.opacity(0);
      const li = this.charLineIndex(i);
      const w = li >= 0 ? this.lineWidths[li] : this.lineWidths[0];
      c.position.x(origX[i] - w * 0.1);
    });
    yield* sequence(stagger, ...this.chars.map((c, i) =>
        all(c.opacity(1, duration * 0.8, tf), c.position.x(origX[i], duration, tf)),
    ));
  }

  @threadable()
  public *motionUp(duration = 0.5, stagger = 0.03, tf: TimingFunction = easeOutCubic): ThreadGenerator {
    this.prepare('motionUp');
    const origY = this.saveY();
    const h = this.maxCharHeight;
    this.chars.forEach((c, i) => { c.opacity(0); c.position.y(origY[i] + h); });
    yield* sequence(stagger, ...this.chars.map((c, i) =>
        all(c.opacity(1, 0.15), c.position.y(origY[i], duration, tf)),
    ));
  }

  @threadable()
  public *motionDown(duration = 0.5, stagger = 0.03, tf: TimingFunction = easeOutCubic): ThreadGenerator {
    this.prepare('motionDown');
    const origY = this.saveY();
    const h = this.maxCharHeight;
    this.chars.forEach((c, i) => { c.opacity(0); c.position.y(origY[i] - h); });
    yield* sequence(stagger, ...this.chars.map((c, i) =>
        all(c.opacity(1, 0.15), c.position.y(origY[i], duration, tf)),
    ));
  }

  @threadable()
  public *scaleIn(duration = 0.5, stagger = 0.08, tf: TimingFunction = easeOutBack): ThreadGenerator {
    this.prepare('scaleIn');
    this.chars.forEach(c => { c.opacity(0); c.scale(0); });
    yield* sequence(stagger, ...this.chars.map(c =>
        all(c.opacity(1, duration * 0.4), c.scale(1, duration, tf)),
    ));
  }

  @threadable()
  public *bounceIn(duration = 0.5, stagger = 0.03, tf: TimingFunction = easeOutBack): ThreadGenerator {
    this.prepare('bounceIn');
    const origY = this.saveY();
    const h = this.maxCharHeight;
    this.chars.forEach((c, i) => { c.opacity(0); c.position.y(origY[i] - h); });
    yield* sequence(stagger, ...this.chars.map((c, i) =>
        all(c.opacity(1, 0.15), c.position.y(origY[i], duration, tf)),
    ));
  }

  @threadable()
  public *revealUp(duration = 0.6, tf: TimingFunction = easeOutCubic): ThreadGenerator {
    this.prepareClipped('revealUp');
    const origY = this.saveY();
    const h = this.maxCharHeight;
    this.chars.forEach((c, i) => { c.opacity(0); c.position.y(origY[i] + h); });
    this.chars.forEach(c => c.opacity(1));
    yield* all(...this.chars.map((c, i) => c.position.y(origY[i], duration, tf)));
  }

  @threadable()
  public *revealDown(duration = 0.6, tf: TimingFunction = easeOutCubic): ThreadGenerator {
    this.prepareClipped('revealDown');
    const origY = this.saveY();
    const h = this.maxCharHeight;
    this.chars.forEach((c, i) => { c.opacity(0); c.position.y(origY[i] - h); });
    this.chars.forEach(c => c.opacity(1));
    yield* all(...this.chars.map((c, i) => c.position.y(origY[i], duration, tf)));
  }

  @threadable()
  public *revealLeft(duration = 0.6, tf: TimingFunction = easeOutCubic): ThreadGenerator {
    this.prepareClipped('revealLeft');
    const origX = this.saveX();
    this.chars.forEach((c, i) => {
      c.opacity(0);
      const li = this.charLineIndex(i);
      const w = li >= 0 ? this.lineWidths[li] : this.lineWidths[0];
      c.position.x(origX[i] + w);
    });
    this.chars.forEach(c => c.opacity(1));
    yield* all(...this.chars.map((c, i) => c.position.x(origX[i], duration, tf)));
  }

  @threadable()
  public *revealRight(duration = 0.6, tf: TimingFunction = easeOutCubic): ThreadGenerator {
    this.prepareClipped('revealRight');
    const origX = this.saveX();
    this.chars.forEach((c, i) => {
      c.opacity(0);
      const li = this.charLineIndex(i);
      const w = li >= 0 ? this.lineWidths[li] : this.lineWidths[0];
      c.position.x(origX[i] - w);
    });
    this.chars.forEach(c => c.opacity(1));
    yield* all(...this.chars.map((c, i) => c.position.x(origX[i], duration, tf)));
  }

  @threadable()
  public *wordByWord(duration = 0.4, stagger = 0.1, tf: TimingFunction = easeOutCubic): ThreadGenerator {
    this.prepare('wordByWord');
    const origY = this.saveY();
    const h = this.maxCharHeight;
    this.chars.forEach((c, i) => { c.opacity(0); c.position.y(origY[i] + h * 0.2); });
    yield* sequence(stagger, ...this.words.map(wg =>
        all(...wg.map(c => {
          const i = this.chars.indexOf(c);
          return all(c.opacity(1, duration, tf), c.position.y(origY[i], duration, tf));
        })),
    ));
  }

  @threadable()
  public *lineByLine(duration = 0.5, stagger = 0.15, tf: TimingFunction = easeOutCubic): ThreadGenerator {
    this.prepareClipped('lineByLine');
    const origY = this.saveY();
    const h = this.maxCharHeight;
    this.chars.forEach((c, i) => { c.opacity(0); c.position.y(origY[i] + h); });
    const numLines = this.lineWidths.length;
    yield* sequence(stagger, ...Array.from({length: numLines}, (_, li) => {
      const lc = this.lineChars(li);
      lc.forEach(c => c.opacity(1));
      return all(...lc.map(c =>
          c.position.y(origY[this.chars.indexOf(c)], duration, tf),
      ));
    }));
  }

  @threadable()
  public *trackingIn(duration = 0.7, spread = 0.4, tf: TimingFunction = easeOutCubic): ThreadGenerator {
    this.prepare('trackingIn');
    const origX = this.saveX();
    const center = origX.reduce((a, b) => a + b, 0) / origX.length;
    this.chars.forEach((c, i) => {
      c.opacity(0);
      c.position.x(origX[i] + (origX[i] - center) * spread);
    });
    yield* all(...this.chars.map((c, i) =>
        all(c.opacity(1, duration * 0.7, tf), c.position.x(origX[i], duration, tf)),
    ));
  }

  @threadable()
  public *waveIn(duration = 2, tf: TimingFunction = easeOutCubic): ThreadGenerator {
    this.prepare('waveIn');
    const origY = this.saveY();
    const h = this.maxCharHeight;
    this.chars.forEach(c => c.opacity(0));
    yield* tween(duration, t => {
      const p = tf(t);
      for (let i = 0; i < this.chars.length; i++) {
        const cp = Math.max(0, Math.min(1, (p - i * 0.03) / 0.5));
        this.chars[i].opacity(Math.min(cp * 2, 1));
        this.chars[i].position.y(origY[i] + Math.sin(p * Math.PI * 4 - i * 0.3) * h * 0.3 * (1 - p));
      }
    });
    this.chars.forEach((c, i) => { c.opacity(1); c.position.y(origY[i]); });
  }

  @threadable()
  public *rotateIn(duration = 0.5, stagger = 0.04, tf: TimingFunction = easeOutCubic): ThreadGenerator {
    this.prepare('rotateIn');
    this.chars.forEach(c => { c.opacity(0); c.rotation(90); c.scale(0.5); });
    yield* sequence(stagger, ...this.chars.map(c =>
        all(c.opacity(1, duration * 0.4), c.rotation(0, duration, tf), c.scale(1, duration, tf)),
    ));
  }

  @threadable()
  public *scramble(duration = 2, tf: TimingFunction = easeOutCubic): ThreadGenerator {
    this.prepare('scramble');
    const charTexts = this.chars.map(c => c.text());
    const pool = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%&*';
    this.chars.forEach(c => c.opacity(0));
    yield* tween(duration, t => {
      const p = tf(t);
      for (let i = 0; i < this.chars.length; i++) {
        const cp = Math.max(0, Math.min(1, (p - i * 0.03) / 0.5));
        this.chars[i].opacity(Math.min(cp * 2, 1));
        if (cp < 0.7 && cp > 0) {
          this.chars[i].text(pool[Math.floor(Math.random() * pool.length)]);
        } else if (cp >= 0.7) {
          this.chars[i].text(charTexts[i]);
        }
      }
    });
    this.chars.forEach((c, i) => c.text(charTexts[i]));
  }

  @threadable()
  public *outline(_duration = 0.5, stagger = 0.04): ThreadGenerator {
    this.prepare('outline');
    const fillColor = String(this.fill() ?? '#ffffff');
    const chars = this.chars;
    // Phase 1: show as stroke-only outlines
    chars.forEach(c => {
      c.fill(null);
      c.stroke(fillColor);
      c.charLineWidth(1.5);
      c.opacity(0);
    });
    yield* sequence(stagger, ...chars.map(c => c.opacity(1, 0.2)));
    // Phase 2: crossfade stroke → fill per character
    yield* sequence(stagger, ...chars.map(c =>
        tween(0.3, t => {
          if (t < 0.5) {
            c.opacity(1 - t * 0.6);
          } else {
            c.fill(fillColor);
            c.stroke(null);
            c.charLineWidth(0);
            c.opacity(0.7 + (t - 0.5) * 0.6);
          }
        }),
    ));
  }

  @threadable()
  public *neon(duration = 0.5, stagger = 0.06, tf: TimingFunction = easeOutSine): ThreadGenerator {
    this.prepare('neon');
    const fillColor = String(this.fill() ?? '#ffffff');
    this.chars.forEach(c => {
      c.opacity(0);
      c.charShadowColor(fillColor);
      c.charShadowBlur(0);
    });
    yield* sequence(stagger, ...this.chars.map(c =>
        all(c.opacity(1, 0.3), c.charShadowBlur(20, duration, tf)),
    ));
  }

  @threadable()
  public *shadowIn(duration = 0.5, stagger = 0.03, tf: TimingFunction = easeOutCubic): ThreadGenerator {
    this.prepare('shadowIn');
    const origY = this.saveY();
    const h = this.maxCharHeight;
    this.chars.forEach((c, i) => {
      c.opacity(0);
      c.position.y(origY[i] + h * 0.4);
      c.charShadowColor('rgba(0,0,0,0.5)');
      c.charShadowBlur(4);
    });
    yield* sequence(stagger, ...this.chars.map((c, i) =>
        all(c.opacity(1, 0.3), c.position.y(origY[i], duration, tf)),
    ));
  }

  // ─── Exit Animations ──────────────────────────────────────────

  /**
   * Finish an exit animation: hide the node and drop the split chars so the
   * shifted/scaled char state doesn't leak into the next entrance (which
   * re-splits from the current text and layout).
   */
  private endExit() {
    this.opacity(0);
    this.unsplit();
  }

  @threadable()
  public *fadeOut(duration = 0.35, tf: TimingFunction = easeInCubic): ThreadGenerator {
    this.prepareExit();
    yield* all(...this.chars.map(c => c.opacity(0, duration, tf)));
    this.endExit();
  }

  @threadable()
  public *fadeOutUp(duration = 0.35, stagger = 0, tf: TimingFunction = easeInCubic): ThreadGenerator {
    this.prepareExit();
    const origY = this.saveY();
    const h = this.maxCharHeight;
    yield* sequence(stagger, ...this.chars.map((c, i) =>
        all(c.opacity(0, duration, tf), c.position.y(origY[i] - h * 0.15, duration, tf)),
    ));
    this.endExit();
  }

  @threadable()
  public *fadeOutDown(duration = 0.35, stagger = 0, tf: TimingFunction = easeInCubic): ThreadGenerator {
    this.prepareExit();
    const origY = this.saveY();
    const h = this.maxCharHeight;
    yield* sequence(stagger, ...this.chars.map((c, i) =>
        all(c.opacity(0, duration, tf), c.position.y(origY[i] + h * 0.15, duration, tf)),
    ));
    this.endExit();
  }

  @threadable()
  public *scaleOut(duration = 0.3, tf: TimingFunction = easeInCubic): ThreadGenerator {
    this.prepareExit();
    yield* all(...this.chars.map(c =>
        all(c.opacity(0, duration, tf), c.scale(0.8, duration, tf)),
    ));
    this.endExit();
  }

  @threadable()
  public *revealOutUp(duration = 0.35, tf: TimingFunction = easeInCubic): ThreadGenerator {
    this.prepareExit();
    const origY = this.saveY();
    const h = this.maxCharHeight;
    yield* all(...this.chars.map((c, i) =>
        c.position.y(origY[i] - h, duration, tf),
    ));
    this.endExit();
  }

  @threadable()
  public *revealOutDown(duration = 0.35, tf: TimingFunction = easeInCubic): ThreadGenerator {
    this.prepareExit();
    const origY = this.saveY();
    const h = this.maxCharHeight;
    yield* all(...this.chars.map((c, i) =>
        c.position.y(origY[i] + h, duration, tf),
    ));
    this.endExit();
  }

  @threadable()
  public *trackingOut(duration = 0.35, spread = 0.2, tf: TimingFunction = easeInCubic): ThreadGenerator {
    this.prepareExit();
    const origX = this.saveX();
    const center = origX.reduce((a, b) => a + b, 0) / origX.length;
    yield* all(...this.chars.map((c, i) =>
        all(
            c.opacity(0, duration, tf),
            c.position.x(origX[i] - (origX[i] - center) * spread, duration, tf),
        ),
    ));
    this.endExit();
  }

  @threadable()
  public *swapOut(duration = 0.3, tf: TimingFunction = easeInCubic): ThreadGenerator {
    this.prepareExit();
    const origY = this.saveY();
    const h = this.maxCharHeight;
    yield* all(...this.chars.map((c, i) =>
        all(
            c.opacity(0, duration * 0.8, tf),
            c.position.y(origY[i] - h, duration, tf),
        ),
    ));
    this.endExit();
  }
}

[
  'fill',
  'stroke',
  'lineWidth',
  'strokeFirst',
  'lineCap',
  'lineJoin',
  'lineDash',
  'lineDashOffset',
  'textDirection',
].forEach(prop => {
  (Txt.prototype as any)[`getDefault${capitalize(prop)}`] = function (
    this: Txt,
    initial: unknown,
  ) {
    return (this.parentTxt() as any)?.[prop]() ?? initial;
  };
});
