import {afterAll, afterEach, beforeAll, describe, expect, it, vi} from 'vitest';
import {Txt} from '../Txt';
import {TxtLeaf} from '../TxtLeaf';
import {mockScene2D} from './mockScene2D';

// Lets a test pretend there is no canvas without the shared context's cache
// leaking between tests.
let noCanvas = false;
vi.mock('../../text/measureContext', async importOriginal => {
  const original =
    await importOriginal<typeof import('../../text/measureContext')>();
  return {
    ...original,
    getMeasureContext: () => (noCanvas ? null : original.getMeasureContext()),
  };
});

// jsdom has no layout or canvas. Fake both: every character advances ADV px
// (or its CELL entry) in the DOM, kerning pairs shrink the first character's
// cell, and CSS letter-spacing adds the spacing after every character
// (including the last one on a line), like browsers do. Characters from
// index `wrapAt` on go to a second line.
const ADV = 10;
const HEIGHT = 12;
const ASCENT = 9;
const FONT_SIZE = 48;
const KERN: Record<string, number> = {AV: 3};
// DOM cell advances that differ from the standalone (canvas) ones, like the
// joined forms of a cursive script.
const CELL: Record<string, number> = {Q: 2, ب: 6};
const STANDALONE: Record<string, number> = {ب: 18};
let wrapAt = Infinity;

function spacingOf(node: Node) {
  const el = node instanceof Element ? node : node.parentElement;
  return parseFloat((el as HTMLElement | null)?.style.letterSpacing ?? '') || 0;
}

/** Character boxes of an element's text, laid out as described above. */
function layoutOf(el: Element) {
  const text = el.textContent ?? '';
  const spacing = spacingOf(el);
  const boxes: {left: number; top: number; width: number}[] = [];
  let x = 0;
  for (let i = 0; i < text.length; i++) {
    if (i === wrapAt) x = 0;
    const cell =
      (CELL[text[i]] ?? ADV) - (KERN[text[i] + (text[i + 1] ?? '')] ?? 0);
    boxes.push({left: x, top: i >= wrapAt ? HEIGHT : 0, width: cell + spacing});
    x += cell + spacing;
  }
  return boxes;
}

function union(boxes: {left: number; top: number; width: number}[]) {
  if (boxes.length === 0) return rect(0, 0, 0, HEIGHT);
  const left = Math.min(...boxes.map(b => b.left));
  const right = Math.max(...boxes.map(b => b.left + b.width));
  const top = Math.min(...boxes.map(b => b.top));
  const bottom = Math.max(...boxes.map(b => b.top + HEIGHT));
  return rect(left, top, right - left, bottom - top);
}

/** Character offset of `offset` inside `node`, counted over its parent. */
function charOffset(node: Node, offset: number) {
  let index = offset;
  for (let s = node.previousSibling; s; s = s.previousSibling) {
    index += s.textContent?.length ?? 0;
  }
  return index;
}

function rect(left: number, top: number, width: number, height: number) {
  return {
    left,
    x: left,
    top,
    y: top,
    width,
    height,
    right: left + width,
    bottom: top + height,
  } as DOMRect;
}

/** The measuring context: standalone advances, rejects "bad" fonts. */
function measuringContext() {
  let font = '10px sans-serif';
  return {
    get font() {
      return font;
    },
    set font(value: string) {
      if (!value.includes('BadFont')) font = value;
    },
    letterSpacing: '0px',
    textBaseline: 'alphabetic',
    measureText: (text: string) => ({
      width: [...text].reduce((w, c) => w + (STANDALONE[c] ?? ADV), 0),
      fontBoundingBoxAscent: ASCENT,
      fontBoundingBoxDescent: HEIGHT - ASCENT,
      actualBoundingBoxAscent: 7,
      actualBoundingBoxDescent: 0,
    }),
  };
}

/** Records the canvas state at each fillText call. */
function recordingContext() {
  const calls: {
    text: string;
    x: number;
    y: number;
    letterSpacing: string;
    textAlign: string;
    textBaseline: string;
  }[] = [];
  const ctx: any = {
    calls,
    font: '',
    letterSpacing: '0px',
    textAlign: 'start',
    textBaseline: 'alphabetic',
    save() {},
    restore() {},
    translate() {},
    rotate() {},
    scale() {},
    beginPath() {},
    rect() {},
    clip() {},
    strokeText() {},
    setLineDash() {},
    measureText: () => ({fontBoundingBoxAscent: ASCENT, width: 0}),
    fillText(text: string, x: number, y: number) {
      calls.push({
        text,
        x,
        y,
        letterSpacing: ctx.letterSpacing,
        textAlign: ctx.textAlign,
        textBaseline: ctx.textBaseline,
      });
    },
  };
  return ctx;
}

describe('Txt letterSpacing', () => {
  mockScene2D();
  let rangeRect: Range['getBoundingClientRect'];
  let polyfilledInnerText = false;

  beforeAll(() => {
    // jsdom implements neither innerText (TxtLeaf clears its text nodes with
    // it) nor Range#getBoundingClientRect.
    if (!Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'innerText')) {
      Object.defineProperty(HTMLElement.prototype, 'innerText', {
        configurable: true,
        get(this: HTMLElement) {
          return this.textContent;
        },
        set(this: HTMLElement, value: string) {
          this.textContent = value;
        },
      });
      polyfilledInnerText = true;
    }
    rangeRect = Range.prototype.getBoundingClientRect;
    Range.prototype.getBoundingClientRect = function (this: Range) {
      const container = this.startContainer;
      if (container.nodeType !== Node.TEXT_NODE) {
        return union(layoutOf(container as Element));
      }
      const boxes = layoutOf(container.parentElement!);
      const start = charOffset(container, this.startOffset);
      const end = charOffset(this.endContainer, this.endOffset);
      return union(boxes.slice(start, end));
    };
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(
      function (this: Element) {
        const box = union(layoutOf(this));
        return rect(0, 0, box.width, box.height);
      },
    );
    const context = measuringContext();
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(
      () => context as any,
    );
  });

  afterEach(() => {
    noCanvas = false;
    wrapAt = Infinity;
  });

  afterAll(() => {
    if (polyfilledInnerText) {
      delete (HTMLElement.prototype as any).innerText;
    }
    Range.prototype.getBoundingClientRect = rangeRect;
    vi.restoreAllMocks();
  });

  function leafOf(
    spacing: number,
    text = 'AB',
    props: Record<string, any> = {},
  ) {
    const txt = (
      <Txt
        textWrap
        letterSpacing={spacing}
        textCenter="line"
        fontSize={FONT_SIZE}
        text={text}
        {...props}
      />
    ) as Txt;
    // Draw at the line's own coordinates rather than via the smoothing pivot.
    txt.smooth = false;
    txt.disableSmooth();
    const leaf = txt.childAs<TxtLeaf>(0)!;
    // The leaf's size comes from the (faked) DOM box.
    leaf.size();
    return {txt, leaf};
  }

  function drawn(leaf: TxtLeaf) {
    const ctx = recordingContext();
    (leaf as any).draw(ctx);
    return ctx.calls as ReturnType<typeof recordingContext>['calls'];
  }

  it('draws the glyphs half a spacing into their cells', () => {
    // Box: 2 * (10 + 6) = 32 wide, from -16 to 16. Glyphs: [-13, -3], [3, 13].
    const {leaf} = leafOf(6);
    const [call] = drawn(leaf);
    expect(call.text).toBe('AB');
    expect(call.x).toBe(-13);
    expect(call.letterSpacing).toBe('6px');
  });

  it('keeps zero spacing unchanged', () => {
    const {leaf} = leafOf(0);
    expect(drawn(leaf)[0].x).toBe(-10);
  });

  it('centers the ink for negative spacing and grows the cache box', () => {
    // Box: 2 * (10 - 4) = 12 wide. Glyphs: [-8, 2], [-2, 8].
    const {leaf} = leafOf(-4);
    expect(drawn(leaf)[0].x).toBe(-8);
    const bbox = (leaf as any).getCacheBBox();
    // fontSize / 2 of slack plus the 2px overhang.
    expect(bbox.x).toBe(-6 - FONT_SIZE / 2 - 2);
    expect(bbox.x + bbox.width).toBe(6 + FONT_SIZE / 2 + 2);
    // Positive spacing needs no extra room.
    const wide = (leafOf(6).leaf as any).getCacheBBox();
    expect(wide.x).toBe(-16 - FONT_SIZE / 2);
  });

  it('places split chars where the unsplit text draws them', () => {
    for (const spacing of [0, 6, 20, -3]) {
      const {txt, leaf} = leafOf(spacing, 'NEW');
      const origin = drawn(leaf)[0].x;
      txt.split();
      txt.chars.forEach((char, i) => {
        // Unsplit glyph i: origin + i * (advance + spacing), centred on ADV.
        expect(char.x()).toBeCloseTo(origin + i * (ADV + spacing) + ADV / 2);
      });
    }
  });

  it('centres kerned chars on their own advance, not their cell', () => {
    // "A" kerns 3px into "V": cells 7 + 6 and 10 + 6, the box from -14.5.
    const {txt, leaf} = leafOf(6, 'AV');
    const origin = drawn(leaf)[0].x;
    expect(origin).toBe(-11.5);
    txt.split();
    // Centred on A's 10px glyph, not on its 13px cell (which would be -8).
    expect(txt.chars[0].x()).toBeCloseTo(-14.5 + 3 + ADV / 2);
    // The unsplit "V" starts after A's kerned advance plus the spacing.
    expect(txt.chars[1].x()).toBeCloseTo(origin + 7 + 6 + ADV / 2);
  });

  it('falls back to the cell centre when the standalone advance differs a lot', () => {
    // "Q" is 2px wide in the DOM but 10px standalone: more than a kerning
    // pair (0.1 * fontSize), so the standalone form is not what is drawn.
    const {txt} = leafOf(6, 'AQ');
    txt.split();
    // Box: 16 + 8 = 24, from -12. Q's cell: [4, 12].
    expect(txt.chars[1].x()).toBeCloseTo(8);
    expect(txt.chars[0].x()).toBeCloseTo(-12 + 3 + ADV / 2);
  });

  it('does not shift cursive scripts, which are not letter-spaced', () => {
    // Arabic: isolated forms are far wider than the joined cells.
    const {txt, leaf} = leafOf(6, 'بب');
    // Box: 2 * (6 + 6) = 24, from -12.
    expect(drawn(leaf)[0].x).toBe(-12);
    txt.split();
    expect(txt.chars[0].x()).toBeCloseTo(-6);
    expect(txt.chars[1].x()).toBeCloseTo(6);
  });

  it('draws split chars centred without canvas letter spacing', () => {
    const {txt, leaf} = leafOf(6);
    txt.split();
    const calls = drawn(leaf);
    expect(calls.map(c => c.text)).toEqual(['A', 'B']);
    for (const call of calls) {
      expect(call.x).toBe(0);
      expect(call.letterSpacing).toBe('0px');
      expect(call.textAlign).toBe('center');
      // Same 'bottom' baseline as the unsplit line: top + ascent, relative to
      // the char's centre (half the line height below the top).
      expect(call.textBaseline).toBe('bottom');
      expect(call.y).toBeCloseTo(ASCENT - HEIGHT / 2);
    }
  });

  it('scales the baseline offset with a per-char font size', () => {
    const {txt, leaf} = leafOf(6);
    txt.split();
    txt.chars[0].fontSize(FONT_SIZE * 2);
    const [a, b] = drawn(leaf);
    expect(a.y).toBeCloseTo((ASCENT - HEIGHT / 2) * 2);
    expect(b.y).toBeCloseTo(ASCENT - HEIGHT / 2);
  });

  it('falls back to the cell centre and middle baseline without a canvas', () => {
    noCanvas = true;
    const {txt, leaf} = leafOf(6, 'AV');
    txt.split();
    // Cells: A [-14.5, -1.5], V [-1.5, 14.5].
    expect(txt.chars[0].x()).toBeCloseTo(-8);
    expect(txt.chars[1].x()).toBeCloseTo(6.5);
    const [call] = drawn(leaf);
    expect(call.textBaseline).toBe('middle');
    expect(call.y).toBe(0);
  });

  it('falls back when the font does not parse', () => {
    const {txt} = leafOf(6, 'AV', {fontFamily: 'BadFont'});
    txt.split();
    // The cell centre, as without a canvas.
    expect(txt.chars[0].x()).toBeCloseTo(-8);
  });

  it('handles each line of wrapped text', () => {
    wrapAt = 2;
    const {txt, leaf} = leafOf(6, 'ABCD');
    // Box: 32 x 24, from (-16, -12). Both lines start at the left edge.
    const calls = drawn(leaf);
    expect(calls.map(c => [c.text, c.x])).toEqual([
      ['AB', -13],
      ['CD', -13],
    ]);
    expect(calls[1].y - calls[0].y).toBe(HEIGHT);
    txt.split(true);
    expect(txt.chars.map(c => c.x())).toEqual([-8, 8, -8, 8]);
    expect(txt.chars.map(c => c.y())).toEqual([-6, -6, 6, 6]);
    expect(leaf.leafLineInfos().map(l => [l.x0, l.x1])).toEqual([
      [-16, 16],
      [-16, 16],
    ]);
    expect(txt.lineWidths).toEqual([32, 32]);
  });

  it('keeps clip rects and line widths on the full cells', () => {
    const {txt, leaf} = leafOf(6);
    txt.split(true);
    const [line] = leaf.leafLineInfos();
    expect(line.x0).toBe(-16);
    expect(line.x1).toBe(16);
    expect(txt.lineWidths).toEqual([32]);
  });

  it('widens clip rects by the overhang of negative spacing', () => {
    const {txt, leaf} = leafOf(-4);
    txt.split(true);
    const [line] = leaf.leafLineInfos();
    expect([line.x0, line.x1]).toEqual([-8, 8]);
    expect(txt.lineWidths).toEqual([12]);
  });

  it('follows letterSpacing changes while split', () => {
    const {txt} = leafOf(6);
    txt.split();
    expect(txt.chars[1].x()).toBeCloseTo(8);
    txt.letterSpacing(10);
    // Box 40 wide: B's cell is [0, 20], glyph [5, 15].
    expect(txt.chars[1].x()).toBeCloseTo(10);
  });
});
