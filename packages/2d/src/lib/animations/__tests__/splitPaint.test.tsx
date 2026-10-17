import {describe, expect, it} from 'vitest';
import {Txt, TxtProps} from '../../components/Txt';
import {failOnSceneErrors} from '../../components/__tests__/failOnSceneErrors';
import {mockScene2D} from '../../components/__tests__/mockScene2D';
import {
  TextState,
  mockTextContext,
} from '../../components/__tests__/mockTextContext';
import {
  PaintCall,
  recordingTextContext,
} from '../../components/__tests__/recordingTextContext';
import {add} from '../../components/__tests__/sceneFixtures';
import {splitText} from '../splitText';

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
  // The fixture does not track `transform()`, so apply the position here.
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

/** Spans of the pieces of a split, in the space of the source. */
function paintedPieces(source: Txt): Span[][] {
  const split = splitText(source);
  const result = split.lines.map(line => line.flatMap(painted));
  split.restore();
  return result;
}

describe('splitText paint', () => {
  mockScene2D();
  failOnSceneErrors();
  mockTextContext(measure);

  const create = (props: TxtProps) => {
    const txt = new Txt({fontSize: 10, lineHeight: 20, ...props});
    add(txt);
    return txt;
  };

  // VZ fecd9351: inside a ligature, the DOM split the glyph's advance evenly
  // across its letters, so the narrow `f` piece was drawn over the `i`.
  it('places the letters of a ligature by their own advances', () => {
    const txt = create({text: 'fin'});
    const [whole] = painted(txt);
    const [line] = paintedPieces(txt);
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
    it(`paints ${textAlign} letter-spaced pieces where the source paints`, () => {
      const txt = create({
        text: 'abc',
        letterSpacing: 4,
        width: 100,
        textAlign,
      });
      const [whole] = painted(txt);
      expect(whole.text).toBe('abc');
      const [line] = paintedPieces(txt);
      line.forEach((span, index) => {
        expect(span.left).toBeCloseTo(whole.left + index * (CharWidth + 4), 5);
        expect(span.right - span.left).toBeCloseTo(CharWidth + 4, 5);
      });
    });
  }

  // VZ fa08c9d3: wrapped right-to-left text was drawn in the wrong place.
  it('paints wrapped right-to-left pieces where the source paints', () => {
    const txt = create({
      text: 'אבג דהו',
      width: 45,
      textDirection: 'rtl',
      textAlign: 'start',
    });
    expect(txt.lineCount()).toBe(2);
    const whole = painted(txt);
    const lines = paintedPieces(txt);
    expect(lines.map(line => line.map(span => span.text).join(''))).toEqual([
      'אבג',
      'דהו',
    ]);
    lines.forEach(line => {
      const source = whole.filter(span => span.text.includes(line[0].text))[0];
      expect(source).toBeDefined();
      // Logical order runs right to left, glyph by glyph.
      for (let at = 0; at < line.length; at++) {
        expect(line[at].right).toBeCloseTo(source.right - at * CharWidth, 5);
      }
    });
  });
});
