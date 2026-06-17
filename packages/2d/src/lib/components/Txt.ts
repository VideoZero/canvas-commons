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
import {fontRegistry} from '../text/fontRegistry';
import {is} from '../utils';
import {Node} from './Node';
import {Shape, ShapeProps} from './Shape';
import {TxtChar, TxtLeaf} from './TxtLeaf';
import {ComponentChildren} from './types';

type TxtChildren = string | Node | (string | Node)[];
type AnyTxt = Txt | TxtLeaf;

export interface TxtProps extends ShapeProps {
  children?: TxtChildren;
  text?: SignalValue<string>;
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

  protected getText(): string {
    if (this.splitOriginalText !== null) {
      return this.splitOriginalText;
    }
    return this.innerText();
  }

  protected setText(value: SignalValue<string>) {
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

  private prepare() {
    if (!this.isSplit) this.split();
    this.opacity(1);
  }

  private prepareClipped() {
    if (!this.isSplit) this.split(true);
    this.opacity(1);
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
  // ─── Entrance Animations ──────────────────────────────────────

  @threadable()
  public *typewriter(_duration = 1.5, stagger = 0.04): ThreadGenerator {
    this.prepare();
    this.chars.forEach(c => c.opacity(0));
    yield* sequence(stagger, ...this.chars.map(c => c.opacity(1, 0)));
  }

  @threadable()
  public *fadeUp(duration = 0.5, stagger = 0.03, tf: TimingFunction = easeOutCubic): ThreadGenerator {
    this.prepare();
    const origY = this.saveY();
    const h = this.maxCharHeight;
    this.chars.forEach((c, i) => { c.opacity(0); c.position.y(origY[i] + h * 0.3); });
    yield* sequence(stagger, ...this.chars.map((c, i) =>
        all(c.opacity(1, duration * 0.8, tf), c.position.y(origY[i], duration, tf)),
    ));
  }

  @threadable()
  public *fadeDown(duration = 0.5, stagger = 0.03, tf: TimingFunction = easeOutCubic): ThreadGenerator {
    this.prepare();
    const origY = this.saveY();
    const h = this.maxCharHeight;
    this.chars.forEach((c, i) => { c.opacity(0); c.position.y(origY[i] - h * 0.3); });
    yield* sequence(stagger, ...this.chars.map((c, i) =>
        all(c.opacity(1, duration * 0.8, tf), c.position.y(origY[i], duration, tf)),
    ));
  }

  @threadable()
  public *fadeLeft(duration = 0.5, stagger = 0.03, tf: TimingFunction = easeOutCubic): ThreadGenerator {
    this.prepare();
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
    this.prepare();
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
    this.prepare();
    const origY = this.saveY();
    const h = this.maxCharHeight;
    this.chars.forEach((c, i) => { c.opacity(0); c.position.y(origY[i] + h); });
    yield* sequence(stagger, ...this.chars.map((c, i) =>
        all(c.opacity(1, 0.15), c.position.y(origY[i], duration, tf)),
    ));
  }

  @threadable()
  public *motionDown(duration = 0.5, stagger = 0.03, tf: TimingFunction = easeOutCubic): ThreadGenerator {
    this.prepare();
    const origY = this.saveY();
    const h = this.maxCharHeight;
    this.chars.forEach((c, i) => { c.opacity(0); c.position.y(origY[i] - h); });
    yield* sequence(stagger, ...this.chars.map((c, i) =>
        all(c.opacity(1, 0.15), c.position.y(origY[i], duration, tf)),
    ));
  }

  @threadable()
  public *scaleIn(duration = 0.5, stagger = 0.08, tf: TimingFunction = easeOutBack): ThreadGenerator {
    this.prepare();
    this.chars.forEach(c => { c.opacity(0); c.scale(0); });
    yield* sequence(stagger, ...this.chars.map(c =>
        all(c.opacity(1, duration * 0.4), c.scale(1, duration, tf)),
    ));
  }

  @threadable()
  public *bounceIn(duration = 0.5, stagger = 0.03, tf: TimingFunction = easeOutBack): ThreadGenerator {
    this.prepare();
    const origY = this.saveY();
    const h = this.maxCharHeight;
    this.chars.forEach((c, i) => { c.opacity(0); c.position.y(origY[i] - h); });
    yield* sequence(stagger, ...this.chars.map((c, i) =>
        all(c.opacity(1, 0.15), c.position.y(origY[i], duration, tf)),
    ));
  }

  @threadable()
  public *revealUp(duration = 0.6, tf: TimingFunction = easeOutCubic): ThreadGenerator {
    this.prepareClipped();
    const origY = this.saveY();
    const h = this.maxCharHeight;
    this.chars.forEach((c, i) => { c.opacity(0); c.position.y(origY[i] + h); });
    this.chars.forEach(c => c.opacity(1));
    yield* all(...this.chars.map((c, i) => c.position.y(origY[i], duration, tf)));
  }

  @threadable()
  public *revealDown(duration = 0.6, tf: TimingFunction = easeOutCubic): ThreadGenerator {
    this.prepareClipped();
    const origY = this.saveY();
    const h = this.maxCharHeight;
    this.chars.forEach((c, i) => { c.opacity(0); c.position.y(origY[i] - h); });
    this.chars.forEach(c => c.opacity(1));
    yield* all(...this.chars.map((c, i) => c.position.y(origY[i], duration, tf)));
  }

  @threadable()
  public *revealLeft(duration = 0.6, tf: TimingFunction = easeOutCubic): ThreadGenerator {
    this.prepareClipped();
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
    this.prepareClipped();
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
    this.prepare();
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
    this.prepareClipped();
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
    this.prepare();
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
    this.prepare();
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
    this.prepare();
    this.chars.forEach(c => { c.opacity(0); c.rotation(90); c.scale(0.5); });
    yield* sequence(stagger, ...this.chars.map(c =>
        all(c.opacity(1, duration * 0.4), c.rotation(0, duration, tf), c.scale(1, duration, tf)),
    ));
  }

  @threadable()
  public *scramble(duration = 2, tf: TimingFunction = easeOutCubic): ThreadGenerator {
    this.prepare();
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
    this.prepare();
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
    this.prepare();
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
    this.prepare();
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

  @threadable()
  public *fadeOut(duration = 0.35, tf: TimingFunction = easeInCubic): ThreadGenerator {
    yield* all(...this.chars.map(c => c.opacity(0, duration, tf)));
  }

  @threadable()
  public *fadeOutUp(duration = 0.35, stagger = 0, tf: TimingFunction = easeInCubic): ThreadGenerator {
    const origY = this.saveY();
    const h = this.maxCharHeight;
    yield* sequence(stagger, ...this.chars.map((c, i) =>
        all(c.opacity(0, duration, tf), c.position.y(origY[i] - h * 0.15, duration, tf)),
    ));
  }

  @threadable()
  public *fadeOutDown(duration = 0.35, stagger = 0, tf: TimingFunction = easeInCubic): ThreadGenerator {
    const origY = this.saveY();
    const h = this.maxCharHeight;
    yield* sequence(stagger, ...this.chars.map((c, i) =>
        all(c.opacity(0, duration, tf), c.position.y(origY[i] + h * 0.15, duration, tf)),
    ));
  }

  @threadable()
  public *scaleOut(duration = 0.3, tf: TimingFunction = easeInCubic): ThreadGenerator {
    yield* all(...this.chars.map(c =>
        all(c.opacity(0, duration, tf), c.scale(0.8, duration, tf)),
    ));
  }

  @threadable()
  public *revealOutUp(duration = 0.35, tf: TimingFunction = easeInCubic): ThreadGenerator {
    const origY = this.saveY();
    const h = this.maxCharHeight;
    yield* all(...this.chars.map((c, i) =>
        c.position.y(origY[i] - h, duration, tf),
    ));
  }

  @threadable()
  public *revealOutDown(duration = 0.35, tf: TimingFunction = easeInCubic): ThreadGenerator {
    const origY = this.saveY();
    const h = this.maxCharHeight;
    yield* all(...this.chars.map((c, i) =>
        c.position.y(origY[i] + h, duration, tf),
    ));
  }

  @threadable()
  public *trackingOut(duration = 0.35, spread = 0.2, tf: TimingFunction = easeInCubic): ThreadGenerator {
    const origX = this.saveX();
    const center = origX.reduce((a, b) => a + b, 0) / origX.length;
    yield* all(...this.chars.map((c, i) =>
        all(
            c.opacity(0, duration, tf),
            c.position.x(origX[i] - (origX[i] - center) * spread, duration, tf),
        ),
    ));
  }

  @threadable()
  public *swapOut(duration = 0.3, tf: TimingFunction = easeInCubic): ThreadGenerator {
    const origY = this.saveY();
    const h = this.maxCharHeight;
    yield* all(...this.chars.map((c, i) =>
        all(
            c.opacity(0, duration * 0.8, tf),
            c.position.y(origY[i] - h, duration, tf),
        ),
    ));
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
].forEach(prop => {
  (Txt.prototype as any)[`getDefault${capitalize(prop)}`] = function (
    this: Txt,
    initial: unknown,
  ) {
    return (this.parentTxt() as any)?.[prop]() ?? initial;
  };
});
