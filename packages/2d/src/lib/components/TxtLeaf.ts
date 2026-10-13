import {
  BBox,
  SignalValue,
  SimpleSignal,
  capitalize,
  lazy,
  textLerp,
} from '@motion-canvas/core';
import {
  computed,
  initial,
  interpolation,
  nodeName,
  signal,
} from '../decorators';
import {resolveFontFamily} from '../text/fontRegistry';
import {getMeasureContext, trySetFont} from '../text/measureContext';
import {segment} from '../text/segmenter';
import {roundPx} from '../utils';
import {Node, NodeProps} from './Node';
import {Shape, ShapeProps} from './Shape';
import {Txt} from './Txt';
import {View2D} from './View2D';

// ═══════════════════════════════════════════════════════════════════════════
// TxtChar — per-character state for split text animations.
//
// Extends Node for its built-in signals (position, opacity, scale, rotation)
// which support tweening. Adds text-specific signals (fill, stroke, shadow).
// Rendering is handled by TxtLeaf — TxtChar is purely a state container.
// ═══════════════════════════════════════════════════════════════════════════

export interface TxtCharProps extends NodeProps {
  text?: SignalValue<string>;
  fontSize?: SignalValue<number>;
  fontFamily?: SignalValue<string>;
  fontWeight?: SignalValue<number | string>;
  fontStyle?: SignalValue<string>;
  fill?: SignalValue<string | null>;
  stroke?: SignalValue<string | null>;
  charLineWidth?: SignalValue<number>;
  charShadowColor?: SignalValue<string>;
  charShadowBlur?: SignalValue<number>;
}

@nodeName('TxtChar')
export class TxtChar extends Node {
  @initial('')
  @signal()
  public declare readonly text: SimpleSignal<string, this>;

  @initial(48)
  @signal()
  public declare readonly fontSize: SimpleSignal<number, this>;

  @initial('sans-serif')
  @signal()
  public declare readonly fontFamily: SimpleSignal<string, this>;

  @initial(400)
  @signal()
  public declare readonly fontWeight: SimpleSignal<number | string, this>;

  @initial('normal')
  @signal()
  public declare readonly fontStyle: SimpleSignal<string, this>;

  @initial('#ffffff')
  @signal()
  public declare readonly fill: SimpleSignal<string | null, this>;

  @initial(null)
  @signal()
  public declare readonly stroke: SimpleSignal<string | null, this>;

  @initial(0)
  @signal()
  public declare readonly charLineWidth: SimpleSignal<number, this>;

  @initial('')
  @signal()
  public declare readonly charShadowColor: SimpleSignal<string, this>;

  @initial(0)
  @signal()
  public declare readonly charShadowBlur: SimpleSignal<number, this>;

  public smooth = false;

  public constructor(props: TxtCharProps) {
    super(props);
  }

  public enableSmooth() {
    this.smooth = true;
  }

  public disableSmooth() {
    this.smooth = false;
  }

  public cloneChar(): TxtChar {
    return new TxtChar({
      text: this.text(),
      fontSize: this.fontSize(),
      fontFamily: this.fontFamily(),
      fontWeight: this.fontWeight(),
      fontStyle: this.fontStyle(),
      fill: this.fill(),
      stroke: this.stroke(),
      charLineWidth: this.charLineWidth(),
      charShadowColor: this.charShadowColor(),
      charShadowBlur: this.charShadowBlur(),
      x: this.position.x(),
      y: this.position.y(),
      scale: this.scale(),
      rotation: this.rotation(),
      opacity: this.opacity(),
    });
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// TxtLeaf
// ═══════════════════════════════════════════════════════════════════════════

export interface TxtLeafProps extends ShapeProps {
  children?: string;
  text?: SignalValue<string>;
}

export interface LeafLineInfo {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  charIndices: number[];
}

interface CharInfo {
  /** Centre of the glyph as the unsplit text draws it (the TxtChar's x). */
  x: number;
  y: number;
  /** Left edge of the character's DOM cell (advance + letter spacing). */
  left: number;
  /** Width of the character's DOM cell. */
  w: number;
  h: number;
  /**
   * Offset from `y` to where draw() puts the line's 'bottom' baseline, or
   * null when no measuring canvas is available.
   */
  baseline: number | null;
  char: string;
  lineIndex: number;
}

// Scripts browsers don't apply letter-spacing to, to keep them joined.
const CursiveScripts =
  /[\p{Script=Arabic}\p{Script=Syriac}\p{Script=Mongolian}\p{Script=Nko}\p{Script=Mandaic}\p{Script=Phags_Pa}\p{Script=Manichaean}\p{Script=Psalter_Pahlavi}\p{Script=Hanifi_Rohingya}\p{Script=Sogdian}]/u;

@nodeName('TxtLeaf')
export class TxtLeaf extends Shape {
  @lazy(() => {
    const formatter = document.createElement('span');
    View2D.shadowRoot.append(formatter);
    return formatter;
  })
  protected static formatter: HTMLDivElement;

  @initial('')
  @interpolation(textLerp)
  @signal()
  public declare readonly text: SimpleSignal<string, this>;

  // Text outlines should use round joins by default — miter spikes on sharp
  // glyph corners (overrides Shape's 'miter' default for text only).
  @initial('round')
  @signal()
  public declare readonly lineJoin: SimpleSignal<CanvasLineJoin, this>;

  // ─── Split state ──────────────────────────────────────────────

  // charStates holds TxtChar instances created at split time. Identity is
  // stable across font changes; only their x/y/font signals are reactive.
  // The leaf* getters below derive everything else from charLayout() so a
  // font tween automatically reflows lines, words, and bbox metrics.
  public charStates: TxtChar[] = [];

  protected _splitMode = false;
  protected _splitClip = false;
  protected _splitClipPadding = 4;

  /**
   * Whether to apply the sub-pixel smoothing rotation when drawing this leaf
   * (both normal and split rendering). Toggled via {@link enableSmooth} /
   * {@link disableSmooth}.
   */
  public smooth = false;

  public constructor({children, ...rest}: TxtLeafProps) {
    super(rest);
    if (children) {
      this.text(children);
    }
  }

  @computed()
  protected parentTxt() {
    const parent = this.parent();
    return parent instanceof Txt ? parent : null;
  }

  // Applies Txt.textCenter by moving the whole leaf, so normal and split
  // drawing, clip rects and absolute positions all see the same shift.
  protected override getY(): number {
    return super.getY() + roundPx(this.parentTxt()?.textCenterOffset() ?? 0);
  }

  // ─── Per-character measurement & split ────────────────────────

  /**
   * Re-measures every grapheme's bbox via DOM ranges. Wrapped in `@computed`
   * so the result is cached and only re-runs when one of its signal
   * dependencies changes — primarily text, fontFamily, fontSize, fontWeight,
   * fontStyle. TxtChar instances created in {@link splitIntoChars} read x/y
   * out of this array reactively, so a tween on the parent's font signals
   * automatically repositions every char.
   */
  @computed()
  protected charLayout(): CharInfo[] {
    // Touch the signals we want to track as dependencies. Reading the values
    // (instead of just declaring "depends on") is how @computed records its
    // deps. text() is read implicitly via element.childNodes content.
    void this.fontFamily();
    void this.fontSize();
    void this.fontWeight();
    void this.fontStyle();
    void this.text();
    const spacing = this.spacingOffset();
    const cellSpacing = this.letterSpacingPx();
    // Standalone advances, as drawSplitChars() centres each char on its own,
    // and the baseline offset draw() uses.
    const fontSize = this.fontSize();
    let measure = getMeasureContext();
    let fontOffset = 0;
    if (
      measure &&
      !trySetFont(
        measure,
        this.splitFont(
          this.fontStyle(),
          this.fontWeight(),
          fontSize,
          this.fontFamily(),
        ),
      )
    ) {
      // The font did not parse: measurements would use another font.
      measure = null;
    }
    if (measure) {
      if ('letterSpacing' in measure) measure.letterSpacing = '0px';
      measure.textBaseline = 'bottom';
      fontOffset = measure.measureText('').fontBoundingBoxAscent;
    }

    this.requestLayoutUpdate();
    const el = this.element;
    // Measure without ligatures: each TxtChar draws its grapheme standalone,
    // but inside a ligature ("fi", "fl", "ff") the browser splits the single
    // glyph's advance evenly across its characters, so a centred "f" lands on
    // top of the "i" and leaves a gap before it.
    const prevLigatures = el.style.fontVariantLigatures;
    el.style.fontVariantLigatures = 'none';
    const parentRect = el.getBoundingClientRect();
    const {width, height} = this.size();

    const infos: CharInfo[] = [];
    const range = document.createRange();
    let curY = -Infinity;
    let lineIdx = -1;
    // draw() rounds each line's start; shift the line's chars by the same
    // amount so split and unsplit glyphs agree to the subpixel.
    let lineRounding = 0;

    for (const childNode of el.childNodes) {
      if (!childNode.textContent) continue;
      const content = childNode.textContent;
      // Iterate by grapheme cluster, not UTF-16 code unit. Complex scripts
      // (Devanagari, Arabic, Thai) and emoji ZWJ sequences are multi-codepoint
      // clusters that the shaper renders as a single glyph; splitting them
      // by code unit destroys shaping.
      for (const seg of segment(content, 'grapheme')) {
        range.setStart(childNode, seg.index);
        range.setEnd(childNode, seg.index + seg.segment.length);
        const r = range.getBoundingClientRect();
        const rawY = r.top - parentRect.top;
        const left = width / -2 + r.left - parentRect.left;
        if (Math.abs(rawY - curY) > 2) {
          lineIdx++;
          curY = rawY;
          lineRounding = roundPx(left + spacing) - (left + spacing);
        }
        // The unsplit text puts this glyph's origin half a letter spacing
        // into its cell (see spacingOffset). Centre the char on its own
        // advance from there rather than on the cell: the cell also contains
        // the letter spacing and any kerning against the next character.
        // Only trust the standalone advance when it differs from the cell by
        // about a kerning pair: cursive and complex scripts shape differently
        // in isolation (an isolated Arabic letter is far wider than its
        // joined form), and there the cell centre is the better estimate.
        const cellAdvance = r.width - cellSpacing;
        const advance = measure?.measureText(seg.segment).width;
        const x =
          advance !== undefined &&
          Math.abs(advance - cellAdvance) <= fontSize * 0.1
            ? left + spacing + lineRounding + advance / 2
            : left + lineRounding + r.width / 2;
        const y = height / -2 + rawY + r.height / 2;
        infos.push({
          x,
          y,
          left,
          w: r.width,
          h: r.height,
          baseline: measure
            ? roundPx(height / -2 + rawY + fontOffset) - y
            : null,
          char: seg.segment,
          lineIndex: lineIdx,
        });
      }
    }

    el.style.fontVariantLigatures = prevLigatures;
    return infos;
  }

  public splitIntoChars(clip = false, clipPadding = 4): this {
    if (this._splitMode) this.unsplitChars();

    // Set split mode early so any descendant code (TxtChar getters) sees the
    // correct state on the first read.
    this._splitMode = true;
    this._splitClip = clip;
    this._splitClipPadding = clipPadding;

    const infos = this.charLayout();
    if (infos.length === 0) {
      this._splitMode = false;
      return this;
    }

    // Inheritable font props AND x/y positions use reactive getters. Tweens
    // on the parent's fontWeight/fontSize/fontFamily/fontStyle/fill/text now
    // re-trigger `charLayout()` which produces fresh per-char positions, and
    // every TxtChar pulls its current x/y from there. Writing directly to a
    // char's signal (e.g. `chars[3].x(50)`) replaces the getter with a value
    // — that char detaches from the parent and stops auto-reflowing.
    //
    // Everything else (line groupings, word groupings, max char height,
    // char-text list) lives in @computed getters that derive from
    // charLayout() too — see leafLineInfos / leafWords below.
    this.charStates = infos.map(
      (ci, idx) =>
        new TxtChar({
          text: ci.char,
          x: () => this.charLayout()[idx]?.x ?? ci.x,
          y: () => this.charLayout()[idx]?.y ?? ci.y,
          fontSize: () => this.fontSize(),
          fontFamily: () => this.fontFamily(),
          fontWeight: () => this.fontWeight(),
          fontStyle: () => this.fontStyle(),
          fill: () => String(this.fill() ?? '#ffffff'),
        }),
    );

    return this;
  }

  // ─── Reactive leaf metrics ────────────────────────────────────
  // All four are derived from charLayout(), so they re-compute on the same
  // signal changes (fontWeight, fontSize, fontFamily, fontStyle, text).

  @computed()
  public leafCharTexts(): string[] {
    if (!this._splitMode) return [];
    return this.charLayout().map(g => g.char);
  }

  @computed()
  public leafMaxCharHeight(): number {
    if (!this._splitMode) return 0;
    return this.charLayout().reduce((m, g) => Math.max(m, g.h), 0);
  }

  @computed()
  public leafLineInfos(): LeafLineInfo[] {
    if (!this._splitMode) return [];
    const infos = this.charLayout();
    const byLine = new Map<number, {ci: CharInfo; idx: number}[]>();
    for (let i = 0; i < infos.length; i++) {
      const ci = infos[i];
      if (!byLine.has(ci.lineIndex)) byLine.set(ci.lineIndex, []);
      byLine.get(ci.lineIndex)!.push({ci, idx: i});
    }
    const result: LeafLineInfo[] = [];
    const entries = [...byLine.entries()].sort(([a], [b]) => a - b);
    for (const [, lcs] of entries) {
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      const charIndices: number[] = [];
      // Glyphs drawn half a negative spacing past their cells.
      const overhang = this.spacingOverhang();
      for (const {ci, idx} of lcs) {
        x0 = Math.min(x0, ci.left - overhang);
        y0 = Math.min(y0, ci.y - ci.h / 2);
        x1 = Math.max(x1, ci.left + ci.w + overhang);
        y1 = Math.max(y1, ci.y + ci.h / 2);
        charIndices.push(idx);
      }
      result.push({x0, y0, x1, y1, charIndices});
    }
    return result;
  }

  @computed()
  public leafLineWidths(): number[] {
    // The cells' extent, without the clip overhang of negative spacing.
    const overhang = this.spacingOverhang();
    return this.leafLineInfos().map(l => l.x1 - l.x0 - overhang * 2);
  }

  @computed()
  public leafWords(): TxtChar[][] {
    if (!this._splitMode) return [];
    const infos = this.charLayout();
    const result: TxtChar[][] = [];
    let curWord: TxtChar[] = [];
    for (let i = 0; i < infos.length; i++) {
      const isBreak =
        infos[i].char === ' ' ||
        infos[i].char === '\n' ||
        (i > 0 && infos[i].lineIndex !== infos[i - 1].lineIndex);
      if (isBreak && curWord.length > 0) {
        result.push([...curWord]);
        curWord = [];
      }
      if (infos[i].char !== ' ' && infos[i].char !== '\n') {
        curWord.push(this.charStates[i]);
      }
    }
    if (curWord.length > 0) result.push(curWord);
    return result;
  }

  public unsplitChars(): this {
    if (!this._splitMode) return this;
    this.charStates = [];
    // leaf* computed getters automatically return [] / 0 while _splitMode
    // is false, so no explicit reset needed.
    this._splitMode = false;
    this._splitClip = false;
    return this;
  }

  public enableSmooth(): this {
    this.smooth = true;
    this.charStates.forEach(c => c.enableSmooth());
    return this;
  }

  public disableSmooth(): this {
    this.smooth = false;
    this.charStates.forEach(c => c.disableSmooth());
    return this;
  }

  // ─── Drawing ──────────────────────────────────────────────────

  protected override draw(context: CanvasRenderingContext2D) {
    if (this._splitMode) {
      this.drawSplitChars(context);
      return;
    }

    this.requestFontUpdate();
    this.applyStyle(context, this.getCacheBBox());
    this.applyText(context);
    context.font = this.styles.font;
    context.textBaseline = 'bottom';
    const spacing = this.spacingOffset();
    if ('letterSpacing' in context) {
      context.letterSpacing = `${this.letterSpacingPx()}px`;
    }
    const fontOffset = context.measureText('').fontBoundingBoxAscent;

    const parentRect = this.element.getBoundingClientRect();
    const {width, height} = this.size();
    const range = document.createRange();
    let line = '';
    let lineRect: BBox | null = null;
    for (const childNode of this.element.childNodes) {
      if (!childNode.textContent) {
        continue;
      }

      range.selectNodeContents(childNode);
      const rangeRect = range.getBoundingClientRect();

      // Draw each glyph half a letter spacing into its cell (see
      // spacingOffset) so the ink sits centred in the DOM box.
      const x = roundPx(
        width / -2 + rangeRect.left - parentRect.left + spacing,
      );
      const y = roundPx(
        height / -2 + rangeRect.top - parentRect.top + fontOffset,
      );

      if (!lineRect) {
        lineRect = new BBox(x, y, rangeRect.width, rangeRect.height);
        line = childNode.textContent;
        continue;
      }

      if (lineRect.y === y) {
        lineRect.width += rangeRect.width;
        line += childNode.textContent;
      } else {
        this.drawText(context, line, lineRect);
        lineRect.x = x;
        lineRect.y = y;
        lineRect.width = rangeRect.width;
        lineRect.height = rangeRect.height;
        line = childNode.textContent;
      }
    }

    if (lineRect) {
      this.drawText(context, line, lineRect);
    }
  }

  /**
   * Half of this leaf's letter spacing: how far right of its DOM cell each
   * glyph is drawn.
   *
   * @remarks
   * CSS `letter-spacing` (like canvas `letterSpacing`) adds the whole spacing
   * after every character, including the last one on each line, so the DOM
   * box is `letterSpacing` wider than the ink on one side only. Drawing every
   * glyph half the spacing into its cell spreads that space evenly to both
   * sides instead: each character cell is `advance + letterSpacing` wide with
   * the glyph in its middle. The DOM layout (and therefore wrapping and the
   * Txt's size) stays untouched, the ink is centred in the box for any line
   * count, alignment or nesting, and split characters (see charLayout) use
   * the same glyph origins as the unsplit text.
   *
   * Browsers don't letter-space cursive scripts (Arabic, Syriac, ...), so
   * text containing them keeps the plain left-aligned drawing.
   */
  @computed()
  protected spacingOffset(): number {
    return CursiveScripts.test(this.text()) ? 0 : this.letterSpacingPx() / 2;
  }

  /** How far glyphs overhang their cells horizontally (negative spacing). */
  protected spacingOverhang(): number {
    const offset = this.spacingOffset();
    const spacing = this.letterSpacingPx();
    // Shifted glyphs overhang on both sides; unshifted ones on the right only.
    return Math.max(0, offset === 0 ? -spacing : -offset);
  }

  protected letterSpacingPx(): number {
    const spacing = this.letterSpacing();
    return Number.isFinite(spacing) ? spacing : 0;
  }

  protected splitFont(
    style: string,
    weight: number | string,
    size: number,
    family: string,
  ) {
    return `${style} ${weight} ${size}px ${resolveFontFamily(family)}`;
  }

  /**
   * Render individual characters with per-char transforms.
   * All rendering logic lives here — TxtChar is just state.
   */
  protected drawSplitChars(context: CanvasRenderingContext2D) {
    const layout = this.charLayout();
    const leafFontSize = this.fontSize();
    const renderChar = (ch: TxtChar, idx: number) => {
      const opacity = ch.opacity();
      if (opacity <= 0) return;

      const text = ch.text();
      if (!text) return;

      context.save();

      const pos = ch.position();
      const scl = ch.scale();
      const rot = ch.rotation();

      context.translate(pos.x, pos.y);
      if (rot) {
        context.rotate((rot * Math.PI) / 180);
      } else if (ch.smooth) {
        context.rotate(0.001);
      }
      if (scl.x !== 1 || scl.y !== 1) context.scale(scl.x, scl.y);
      context.globalAlpha *= opacity;

      context.font = this.splitFont(
        ch.fontStyle(),
        ch.fontWeight(),
        ch.fontSize(),
        ch.fontFamily(),
      );
      context.textAlign = 'center';
      // Same baseline as draw(), so an untransformed char sits exactly where
      // the unsplit line puts it (a 'middle' baseline is the em-box centre,
      // which is not the DOM line's centre). Scaled if the char's own font
      // size was changed.
      const baseline = layout[idx]?.baseline;
      let textY = 0;
      if (baseline != null) {
        context.textBaseline = 'bottom';
        textY = leafFontSize ? (baseline * ch.fontSize()) / leafFontSize : 0;
      } else {
        context.textBaseline = 'middle';
      }
      // charLayout() centres the char on its bare advance; a non-zero canvas
      // letterSpacing would widen the measured advance and pull the glyph
      // left of the unsplit position.
      if ('letterSpacing' in context) {
        context.letterSpacing = '0px';
      }

      const sc = ch.charShadowColor();
      const sb = ch.charShadowBlur();
      if (sc && sb > 0) {
        context.shadowColor = sc;
        context.shadowBlur = sb;
      }

      const stroke = ch.stroke();
      const lw = ch.charLineWidth();
      if (stroke && lw > 0) {
        context.strokeStyle = stroke;
        context.lineWidth = lw;
        // Honour the leaf's join/cap (defaults to 'round' for text) so split
        // characters don't miter-spike on sharp glyph corners.
        context.lineJoin = this.lineJoin();
        context.lineCap = this.lineCap();
        context.strokeText(text, 0, textY);
      }

      const fill = ch.fill();
      if (fill) {
        context.fillStyle = fill;
        context.fillText(text, 0, textY);
      }

      context.restore();
    };

    if (this._splitClip) {
      for (const line of this.leafLineInfos()) {
        const pad = this._splitClipPadding;
        context.save();
        context.beginPath();
        context.rect(
          line.x0 - pad,
          line.y0 - pad,
          line.x1 - line.x0 + pad * 2,
          line.y1 - line.y0 + pad * 2,
        );
        context.clip();
        for (const idx of line.charIndices) {
          renderChar(this.charStates[idx], idx);
        }
        context.restore();
      }
    } else {
      this.charStates.forEach(renderChar);
    }
  }

  protected drawText(
    context: CanvasRenderingContext2D,
    text: string,
    box: BBox,
  ) {
    if (this.styles.whiteSpace !== 'pre') {
      text = text.replace(/\s+/g, ' ');
    }

    // Draw coordinates. When smoothing, pivot at the line's own anchor
    // (translate → rotate → draw at 0,0) so the tiny rotation nudges the text
    // off the integer-pixel fast path into grayscale anti-aliasing *without*
    // shifting the line's position.
    let x = box.x;
    let y = box.y;
    context.save();
    if (this.smooth) {
      context.translate(box.x, box.y);
      context.rotate(0.001);
      x = 0;
      y = 0;
    }

    if (this.lineWidth() <= 0) {
      context.fillText(text, x, y);
    } else if (this.strokeFirst()) {
      context.strokeText(text, x, y);
      context.fillText(text, x, y);
    } else {
      context.fillText(text, x, y);
      context.strokeText(text, x, y);
    }
    context.restore();
  }

  protected override getCacheBBox(): BBox {
    const size = this.computedSize();
    const range = document.createRange();
    range.selectNodeContents(this.element);
    const bbox = range.getBoundingClientRect();

    const lineWidth = this.lineWidth();
    // We take the default value of the miterLimit as 10.
    const miterLimitCoefficient = this.lineJoin() === 'miter' ? 0.5 * 10 : 0.5;

    return (
      new BBox(
        -size.width / 2,
        -size.height / 2,
        roundPx(bbox.width),
        roundPx(bbox.height),
      )
        // Glyphs are drawn half a letter spacing into their cells, so with a
        // negative spacing the ink overhangs the DOM box on both sides.
        .expand([0, this.fontSize() * 0.5 + this.spacingOverhang()])
        .expand(lineWidth * miterLimitCoefficient)
    );
  }

  protected override applyFlex() {
    super.applyFlex();
    this.element.style.display = 'inline';
  }

  protected override updateLayout() {
    this.applyFont();
    this.applyFlex();

    // Make sure the text is aligned correctly even if the text is smaller than
    // the container.
    if (this.justifyContent.isInitial()) {
      this.element.style.justifyContent =
        this.styles.getPropertyValue('text-align');
    }

    // Treat the literal two-character escape "\n" (backslash + n) — commonly
    // emitted by code generators, LLM agents, and unparsed JSON — as a real
    // newline. A genuine "\n" newline character is already a newline and is
    // left untouched by this replace.
    const text = this.text().replace(/\\n/g, '\n');

    const wrap =
      this.styles.whiteSpace !== 'nowrap' && this.styles.whiteSpace !== 'pre';

    if (wrap) {
      this.element.innerText = '';
      for (const seg of segment(text, 'grapheme')) {
        this.element.appendChild(document.createTextNode(seg.segment));
      }
    } else if (this.styles.whiteSpace === 'pre') {
      this.element.innerText = '';
      for (const line of text.split('\n')) {
        this.element.appendChild(document.createTextNode(line + '\n'));
      }
    } else {
      // The innerText setter converts "\n" into <br> elements for us.
      this.element.innerText = text;
    }
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
  (TxtLeaf.prototype as any)[`get${capitalize(prop)}`] = function (
    this: TxtLeaf,
  ) {
    return (
      (this.parentTxt() as any)?.[prop]() ??
      (this as any)[prop].context.getInitial()
    );
  };
});
