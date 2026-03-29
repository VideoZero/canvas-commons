import {
  DEFAULT,
  InterpolationFunction,
  SignalValue,
  SimpleSignal,
  ThreadGenerator,
  TimingFunction,
  all,
  capitalize,
  threadable,
} from '@motion-canvas/core';
import {computed, initial, nodeName, signal} from '../decorators';
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
    if (this._splitOriginalText !== null) {
      return this._splitOriginalText;
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

  protected _isSplit = false;
  protected _splitOriginalText: string | null = null;

  /**
   * Whether to enable sub-pixel smoothing on split characters.
   *
   * @remarks
   * When `true`, a tiny rotation (0.01 rad) is applied per character
   * to disable canvas pixel-grid snapping, preventing wobble during
   * vertical animation. Enabled by default.
   */
  public smooth = true;

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
    if (this._isSplit) this.unsplit();
    this._splitOriginalText = this.innerText();
    this._forEachLeaf(this, leaf => {
      leaf.splitIntoChars(clip, clipPadding);
    });
    // Aggregate from all TxtLeaf descendants
    this.chars = [];
    this.words = [];
    this.maxCharHeight = 0;
    this.lineWidths = [];
    this._forEachLeaf(this, leaf => {
      this.chars.push(...leaf.charStates);
      this.words.push(...leaf.leafWords);
      this.maxCharHeight = Math.max(this.maxCharHeight, leaf.leafMaxCharHeight);
      this.lineWidths.push(...leaf.leafLineWidths);
    });
    if (this.smooth) this.enableSmooth();
    this._isSplit = true;
    return this;
  }

  /**
   * Revert to normal text rendering.
   */
  public unsplit(): this {
    if (!this._isSplit) return this;
    this._forEachLeaf(this, leaf => {
      leaf.unsplitChars();
    });
    this.chars = [];
    this.words = [];
    this.maxCharHeight = 0;
    this.lineWidths = [];
    this._splitOriginalText = null;
    this._isSplit = false;
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
    this._forEachLeaf(this, leaf => leaves.push(leaf));
    for (const leaf of leaves) {
      if (lineIndex < offset + leaf.leafLineInfos.length) {
        const localLine = lineIndex - offset;
        return leaf.leafLineInfos[localLine].charIndices.map(
          i => leaf.charStates[i],
        );
      }
      offset += leaf.leafLineInfos.length;
    }
    return [];
  }

  protected charLineIndex(charIdx: number): number {
    let charOffset = 0;
    let lineOffset = 0;
    const leaves: TxtLeaf[] = [];
    this._forEachLeaf(this, leaf => leaves.push(leaf));
    for (const leaf of leaves) {
      const localIdx = charIdx - charOffset;
      if (localIdx >= 0 && localIdx < leaf.charStates.length) {
        for (let li = 0; li < leaf.leafLineInfos.length; li++) {
          if (leaf.leafLineInfos[li].charIndices.includes(localIdx)) {
            return lineOffset + li;
          }
        }
      }
      charOffset += leaf.charStates.length;
      lineOffset += leaf.leafLineInfos.length;
    }
    return -1;
  }

  public enableSmooth(): this {
    this._forEachLeaf(this, leaf => leaf.enableSmooth());
    return this;
  }

  public disableSmooth(): this {
    this._forEachLeaf(this, leaf => leaf.disableSmooth());
    return this;
  }

  private prepare() {
    if (!this._isSplit) this.split();
    this.opacity(1);
  }

  private prepareClipped() {
    if (!this._isSplit) this.split(true);
    this.opacity(1);
  }

  // ─── Private helpers ──────────────────────────────────────────

  private _forEachLeaf(node: Node, fn: (leaf: TxtLeaf) => void) {
    for (const child of node.children()) {
      if (child instanceof TxtLeaf) {
        fn(child);
      } else if (child instanceof Txt) {
        // Nested Txt — recurse into its children
        this._forEachLeaf(child, fn);
      }
    }
  }


  // ═══════════════════════════════════════════════════════════════════════
  // Build mode character rects (used by typewriter/charClip/charWipe)
  // ═══════════════════════════════════════════════════════════════════════

  protected override draw(context: CanvasRenderingContext2D) {
    this.drawChildren(context);
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
