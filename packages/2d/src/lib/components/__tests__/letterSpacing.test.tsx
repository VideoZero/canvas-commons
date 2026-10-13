import {afterAll, afterEach, beforeAll, describe, expect, it, vi} from 'vitest';
import {roundPx} from '../../utils';
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
// Glyphs whose DOM box sits slightly lower, like a fallback font's.
const SHIFT: Record<string, number> = {F: 1.5};
let wrapAt = Infinity;

function spacingOf(node: Node) {
  const el = node instanceof Element ? node : node.parentElement;
  return parseFloat((el as HTMLElement | null)?.style.letterSpacing ?? '') || 0;
}

const Hebrew = /[\u0590-\u05ff]/;

/**
 * Character boxes of an element's text, laid out as described above. Runs of
 * Hebrew (with the spaces between their words) are laid out right to left
 * within each line, like the bidi algorithm does: the boxes keep their
 * logical order, but the first one of a run is its rightmost.
 */
function layoutOf(el: Element) {
  const text = el.textContent ?? '';
  const spacing = spacingOf(el);
  const boxes: {left: number; top: number; width: number}[] = [];
  let x = 0;
  for (let i = 0; i < text.length; i++) {
    if (i === wrapAt) x = 0;
    const cell =
      (CELL[text[i]] ?? ADV) - (KERN[text[i] + (text[i + 1] ?? '')] ?? 0);
    boxes.push({
      left: x,
      top: (i >= wrapAt ? HEIGHT : 0) + (SHIFT[text[i]] ?? 0),
      width: cell + spacing,
    });
    x += cell + spacing;
  }
  const rtl = (i: number) =>
    Hebrew.test(text[i]) ||
    (text[i] === ' ' &&
      i - 1 >= 0 &&
      i + 1 < text.length &&
      i !== wrapAt &&
      i + 1 !== wrapAt &&
      Hebrew.test(text[i - 1]) &&
      Hebrew.test(text[i + 1]));
  for (let start = 0; start < text.length; start++) {
    if (!rtl(start)) continue;
    let end = start;
    while (end + 1 < text.length && rtl(end + 1)) {
      if (end + 1 === wrapAt) break;
      end++;
    }
    const from = boxes[start].left;
    const to = boxes[end].left + boxes[end].width;
    for (let i = start; i <= end; i++) {
      boxes[i].left = from + to - (boxes[i].left + boxes[i].width);
    }
    start = end;
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
    direction: string;
  }[] = [];
  const ctx: any = {
    calls,
    font: '',
    letterSpacing: '0px',
    direction: 'inherit',
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
        direction: ctx.direction,
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

  /**
   * jsdom's computed styles are a snapshot taken when the node is created;
   * pin the values a browser would compute (white-space, direction).
   */
  function pinStyles(leaf: TxtLeaf, styles: Record<string, string>) {
    for (const [key, value] of Object.entries(styles)) {
      Object.defineProperty((leaf as any).styles, key, {
        value,
        configurable: true,
      });
    }
  }

  function leafOf(
    spacing: number,
    text = 'AB',
    props: Record<string, any> = {},
    styles: Record<string, string> = {},
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
    pinStyles(leaf, styles);
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
  describe('right-to-left text', () => {
    function leafWithDirection(
      text: string,
      direction: string,
      spacing = 0,
      props: Record<string, any> = {textWrap: true},
      styles: Record<string, string> = {},
    ) {
      const txt = (
        <Txt letterSpacing={spacing} fontSize={FONT_SIZE} {...props}>
          <TxtLeaf text={text} textDirection={direction as CanvasDirection} />
        </Txt>
      ) as Txt;
      txt.smooth = false;
      txt.disableSmooth();
      const leaf = txt.childAs<TxtLeaf>(0)!;
      pinStyles(leaf, styles);
      leaf.size();
      return {txt, leaf};
    }

    const runs = (leaf: TxtLeaf) => drawn(leaf).map(c => [c.text, c.x]);

    it('draws RTL runs from their right edge, not their first character', () => {
      // Box: 30 wide, from -15. Visually ג [-15, -5], ב [-5, 5], א [5, 15].
      const {leaf} = leafOf(0, 'אבג');
      const calls = drawn(leaf);
      expect(calls.map(c => [c.text, c.x])).toEqual([['אבג', 15]]);
      expect(calls[0].textAlign).toBe('right');
      expect(calls[0].direction).toBe('rtl');
    });

    it('keeps plain LTR lines a single left-aligned run', () => {
      const [call] = drawn(leafOf(0, 'AB CD').leaf);
      expect([call.text, call.x]).toEqual(['AB CD', -25]);
      expect(call.textAlign).toBe('left');
      expect(call.direction).toBe('ltr');
    });

    it('anchors every wrapped line at its own edge', () => {
      wrapAt = 2;
      // Box: 20 x 24, from (-10, -12).
      expect(runs(leafOf(0, 'אבגד').leaf)).toEqual([
        ['אב', 10],
        ['גד', 10],
      ]);
    });

    it('leaves whitespace at the end of a wrapped line out', () => {
      // "אב " | "גד": the space hangs at the end of the first line.
      wrapAt = 3;
      expect(runs(leafOf(0, 'אב גד').leaf)).toEqual([
        ['אב', 5],
        ['גד', 5],
      ]);
    });

    it('draws mixed-direction lines as visual runs', () => {
      // "אב AB": visually ב [-25, -15], א [-15, -5], space, A [5, 15], B.
      const calls = drawn(leafOf(0, 'אב AB').leaf);
      expect(calls.map(c => [c.text, c.x, c.direction])).toEqual([
        ['אב', -5, 'rtl'],
        ['AB', 5, 'ltr'],
      ]);
    });

    it('keeps the letter-spacing offset', () => {
      // Cells of 16, box from -16: the run ends half a spacing past the box.
      const {leaf} = leafOf(6, 'אב');
      const [call] = drawn(leaf);
      expect(call.x).toBe(19);
      expect(call.letterSpacing).toBe('6px');
    });

    it('anchors an RTL paragraph at its right edge', () => {
      const {leaf} = leafWithDirection('אבג', 'rtl');
      const [call] = drawn(leaf);
      expect([call.text, call.x]).toEqual(['אבג', 15]);
      expect(call.textAlign).toBe('right');
      expect(call.direction).toBe('rtl');
      // Laid out in that direction before anything measures it.
      expect((leaf as any).element.dir).toBe('rtl');
    });

    it('offsets an RTL paragraph by the letter spacing', () => {
      const {leaf} = leafWithDirection('אב', 'rtl', 6);
      const [call] = drawn(leaf);
      expect([call.x, call.textAlign, call.letterSpacing]).toEqual([
        19,
        'right',
        '6px',
      ]);
    });

    it('draws nowrap and pre text node by node in the paragraph direction', () => {
      const nowrap = leafWithDirection(
        'אבג',
        'rtl',
        0,
        {textWrap: false},
        {whiteSpace: 'nowrap'},
      );
      expect(drawn(nowrap.leaf).map(c => [c.text, c.x, c.textAlign])).toEqual([
        ['אבג', 15, 'right'],
      ]);
      const ltr = leafWithDirection(
        'אבג',
        'ltr',
        0,
        {textWrap: false},
        {whiteSpace: 'nowrap'},
      );
      expect(drawn(ltr.leaf).map(c => [c.text, c.x, c.textAlign])).toEqual([
        ['אבג', -15, 'left'],
      ]);
      wrapAt = 3;
      const pre = leafWithDirection(
        'אב\nגד',
        'rtl',
        0,
        {textWrap: 'pre'},
        {whiteSpace: 'pre'},
      );
      expect(runs(pre.leaf)).toEqual([
        ['אב\n', 15],
        ['גד\n', 15],
      ]);
    });

    it("resolves 'inherit' from the computed direction", () => {
      // Box: 20 wide, from -10; an RTL paragraph anchors at the right edge.
      const rtl = leafWithDirection('אב', 'inherit', 0, undefined, {
        direction: 'rtl',
      });
      expect(drawn(rtl.leaf).map(c => [c.x, c.textAlign])).toEqual([
        [10, 'right'],
      ]);
      // Plain LTR text in an LTR paragraph stays a single left-aligned run.
      const ltr = leafWithDirection('AB', 'inherit', 0, undefined, {
        direction: 'ltr',
      });
      expect(drawn(ltr.leaf).map(c => [c.x, c.textAlign])).toEqual([
        [-10, 'left'],
      ]);
      // LTR text in an RTL paragraph: an LTR run, at its left edge.
      const mixed = leafWithDirection('AB', 'inherit', 0, undefined, {
        direction: 'rtl',
      });
      expect(drawn(mixed.leaf).map(c => [c.x, c.direction])).toEqual([
        [-10, 'ltr'],
      ]);
    });

    it('follows the Txt textDirection unless the leaf has its own', () => {
      const txt = (
        <Txt textWrap fontSize={FONT_SIZE} textDirection="rtl">
          <TxtLeaf text="אבג" />
          <TxtLeaf text="AB" textDirection="ltr" />
          <Txt>
            <TxtLeaf text="גד" />
          </Txt>
        </Txt>
      ) as Txt;
      txt.disableSmooth();
      const [follows, own] = [0, 1].map(i => txt.childAs<TxtLeaf>(i)!);
      const nested = txt.childAs<Txt>(2)!.childAs<TxtLeaf>(0)!;
      expect(follows.textDirection()).toBe('rtl');
      expect(own.textDirection()).toBe('ltr');
      expect(nested.textDirection()).toBe('rtl');
      follows.size();
      own.size();
      expect((txt as any).element.style.direction).toBe('rtl');
      expect((follows as any).element.dir).toBe('rtl');
      const [call] = drawn(follows);
      expect([call.text, call.x, call.textAlign]).toEqual(['אבג', 15, 'right']);
      expect(drawn(own)[0].textAlign).toBe('left');
      // Without a textDirection, nothing changes.
      const plain = leafOf(0, 'אבג');
      expect(plain.leaf.textDirection()).toBe('ltr');
      expect((plain.txt as any).element.style.direction).toBe('ltr');
    });

    it('places split chars on their visual cells, like the unsplit line', () => {
      for (const direction of ['ltr', 'rtl']) {
        const {txt} = leafWithDirection('אבג', direction);
        txt.split();
        expect(txt.chars.map(c => c.x())).toEqual([10, 0, -10]);
      }
      const {txt} = leafOf(6, 'אב');
      txt.split();
      // Cells: ב [-16, 0], א [0, 16]; glyphs centred on their advance.
      expect(txt.chars.map(c => c.x())).toEqual([3 + ADV / 2, -13 + ADV / 2]);
    });
  });

  describe('whitespace and lines', () => {
    const runs = (leaf: TxtLeaf) => drawn(leaf).map(c => [c.text, c.x]);

    it('keeps pre-wrap leading and interior spaces where the DOM has them', () => {
      // "  A  B": 60 wide, from -30; "A" starts at -10.
      const {leaf} = leafOf(
        0,
        '  A  B',
        {textWrap: 'pre-wrap'},
        {whiteSpace: 'pre-wrap'},
      );
      expect(runs(leaf)).toEqual([['A  B', -10]]);
    });

    it('collapses whitespace in the collapsing modes', () => {
      const {leaf} = leafOf(0, 'A  B');
      // The fake DOM does not collapse, so B's box is 2 spaces further, but
      // the drawn string is collapsed like the browser's.
      expect(runs(leaf)).toEqual([['A B', -20]]);
    });

    it('draws nothing for whitespace-only leaves and lines', () => {
      expect(drawn(leafOf(0, '   ').leaf)).toEqual([]);
      // "AB" | "  ": the blank second line joins the first.
      wrapAt = 2;
      // Box: 20 wide (both lines), from -10.
      expect(runs(leafOf(0, 'AB  ').leaf)).toEqual([['AB', -10]]);
    });

    it('anchors leaves of nested Txts at their first glyph', () => {
      const txt = (
        <Txt textWrap fontSize={FONT_SIZE}>
          {'AB '}
          <Txt fontWeight={700}>{' CD'}</Txt>
        </Txt>
      ) as Txt;
      txt.disableSmooth();
      const outer = txt.childAs<TxtLeaf>(0)!;
      const inner = txt.childAs<Txt>(1)!.childAs<TxtLeaf>(0)!;
      inner.disableSmooth();
      outer.size();
      inner.size();
      // Each 30 wide, from -15: "AB" at -15, "CD" after the space at -5.
      expect(runs(outer)).toEqual([['AB', -15]]);
      expect(runs(inner)).toEqual([['CD', -5]]);
    });

    it('keeps a line together within the 2px tolerance', () => {
      // "F" sits 1.5px lower (a fallback font), which rounds differently.
      const calls = drawn(leafOf(0, 'AFB').leaf);
      expect(calls.map(c => [c.text, c.x])).toEqual([['AFB', -15]]);
      // The line's y comes from its first glyph (box 13.5 high): it would
      // be 0.5px lower if taken from "F".
      expect(calls[0].y).toBe(roundPx(-13.5 / 2 + ASCENT));
      expect(drawn(leafOf(0, 'FAB').leaf)[0].y).toBe(
        roundPx(-13.5 / 2 + 1.5 + ASCENT),
      );
    });
  });
});
