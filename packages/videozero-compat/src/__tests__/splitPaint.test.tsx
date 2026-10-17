import {Txt, TxtProps, useScene2D} from '@canvas-commons/2d';
import {describe, expect, it} from 'vitest';
import {AnimTxt} from '../AnimTxt';
import {failOnSceneErrors, mockScene2D} from './mockScene2D';
import {TextState, mockTextContext} from './mockTextContext';
import {PaintCall, recordingTextContext} from './recordingTextContext';

const CharWidth = 10;
const Narrow: Record<string, number> = {f: 6, i: 3};

/**
 * Letter-spaced glyphs, with a narrow `f` and `i`. An `fi` ligature keeps the
 * advance of its letters, as fonts draw it.
 */
function measure(text: string, state: TextState): number {
  const spacing = parseFloat(state.letterSpacing) || 0;
  let width = 0;
  for (const char of text) width += (Narrow[char] ?? CharWidth) + spacing;
  return width;
}

type Span = {text: string; left: number; right: number};

/** Where the glyphs of a paint call land, in the space it was painted in. */
function spanOf(call: PaintCall): Span {
  const width = measure(call.text, {
    font: call.font,
    letterSpacing: `${call.letterSpacing}px`,
  });
  const rtl = call.direction === 'rtl';
  let left = call.penX;
  if (call.textAlign === 'center') left -= width / 2;
  else if (call.textAlign === 'right') left -= width;
  else if (call.textAlign === 'end' && !rtl) left -= width;
  else if (call.textAlign === 'start' && rtl) left -= width;
  return {text: call.text, left, right: left + width};
}

/** Spans a node paints, in the space of its parent. */
function painted(node: Txt): Span[] {
  const {calls, context} = recordingTextContext();
  node.render(context);
  return calls
    .filter(call => call.kind === 'fill')
    .map(spanOf)
    .map(span => ({
      ...span,
      left: span.left + node.x(),
      right: span.right + node.x(),
    }));
}

/** Spans of the character pieces of `splitChars()`, per line. */
function paintedChars(source: AnimTxt): Span[][] {
  source.splitChars();
  const lines = source.lineWidths.map((_, line) =>
    source
      .lineChars(line)
      .flatMap(painted)
      .filter(span => span.text.trim() !== ''),
  );
  source.unsplit();
  return lines;
}

// The VideoZero fixes for split placement, checked on `AnimTxt.splitChars()`.
describe('AnimTxt.splitChars placement', () => {
  mockScene2D();
  failOnSceneErrors();
  mockTextContext(measure);

  const create = (props: TxtProps) => {
    const txt = new AnimTxt({fontSize: 10, lineHeight: 20, ...props});
    useScene2D().getView().add(txt);
    return txt;
  };

  // VZ fecd9351: inside a ligature, the DOM split the glyph's advance evenly
  // across its letters, so the narrow `f` piece was drawn over the `i`.
  it('places the letters of a ligature by their own advances', () => {
    const txt = create({text: 'fin'});
    const [whole] = painted(txt);
    const [line] = paintedChars(txt);
    expect(line.map(span => span.text)).toEqual(['f', 'i', 'n']);
    expect(line[0].left).toBeCloseTo(whole.left, 5);
    expect(line[0].right).toBeCloseTo(whole.left + 6, 5);
    expect(line[1].left).toBeCloseTo(whole.left + 6, 5);
    expect(line[2].left).toBeCloseTo(whole.left + 9, 5);
    expect(line[2].right).toBeCloseTo(whole.right, 5);
  });

  // VZ fcc7450a: letter-spaced pieces drifted from where the source drew
  // them, and letter-spaced text was off center.
  for (const textAlign of ['left', 'center', 'right'] as const) {
    it(`paints ${textAlign} letter-spaced characters in place`, () => {
      const txt = create({
        text: 'abc',
        letterSpacing: 4,
        width: 100,
        textAlign,
      });
      const [whole] = painted(txt);
      const [line] = paintedChars(txt);
      line.forEach((span, index) => {
        expect(span.left).toBeCloseTo(whole.left + index * (CharWidth + 4), 5);
        expect(span.right - span.left).toBeCloseTo(CharWidth + 4, 5);
      });
    });
  }

  // VZ fa08c9d3: wrapped right-to-left text was drawn in the wrong place.
  it('paints wrapped right-to-left characters in place', () => {
    const txt = create({
      text: 'אבג דהו',
      width: 45,
      textDirection: 'rtl',
      textAlign: 'start',
    });
    expect(txt.lineCount()).toBe(2);
    const whole = painted(txt);
    const lines = paintedChars(txt);
    expect(lines.map(line => line.map(span => span.text).join(''))).toEqual([
      'אבג',
      'דהו',
    ]);
    lines.forEach(line => {
      const source = whole.find(span => span.text.includes(line[0].text));
      expect(source).toBeDefined();
      if (!source) return;
      for (let at = 0; at < line.length; at++) {
        expect(line[at].right).toBeCloseTo(source.right - at * CharWidth, 5);
      }
    });
  });
});
