import {afterEach, describe, expect, it} from 'vitest';
import {Txt, TxtProps} from '../Txt';
import {failOnSceneErrors} from './failOnSceneErrors';
import {mockScene2D} from './mockScene2D';
import {mockTextContext} from './mockTextContext';
import {PaintCall, recordingTextContext} from './recordingTextContext';
import {CHAR_WIDTH, add} from './sceneFixtures';

class Probe extends Txt {
  public paintCalls(): PaintCall[] {
    const {calls, context} = recordingTextContext();
    this.draw(context);
    return calls;
  }
}

function probe(props: TxtProps): Probe {
  const node = new Probe(props);
  add(node);
  return node;
}

/** Span a left-anchored paint call inks, without the gap after its glyphs. */
function inkOf(call: PaintCall): [number, number] {
  const glyphs = [...call.text].length;
  const width = glyphs * CHAR_WIDTH + (glyphs - 1) * call.letterSpacing;
  const left =
    call.direction === 'rtl' && call.textAlign === 'start'
      ? call.penX - width
      : call.penX;
  return [left, left + width];
}

describe('Txt paint placement', () => {
  mockScene2D();
  failOnSceneErrors();
  mockTextContext();

  it('centers the ink of letter-spaced text', () => {
    const node = probe({
      text: 'ABC',
      fontSize: 10,
      letterSpacing: 20,
      width: 200,
      textAlign: 'center',
    });

    const [call] = node.paintCalls();
    const [left, right] = inkOf(call);
    expect(left).toBeCloseTo(-right);
  });

  it('inks letter-spaced text from its aligned edge by default', () => {
    const node = probe({text: 'ABC', fontSize: 10, letterSpacing: 20});

    const [call] = node.paintCalls();
    expect(node.size().x).toBeCloseTo(90);
    expect(inkOf(call)).toEqual([-45, 25]);
  });

  describe('with centerLetterSpacing', () => {
    afterEach(() => {
      Txt.defaultCenterLetterSpacing = false;
    });

    for (const textAlign of ['start', 'left', 'center', 'right'] as const) {
      it(`centers the ink of ${textAlign}-aligned text sized to it`, () => {
        const node = probe({
          text: 'ABC',
          fontSize: 10,
          letterSpacing: 20,
          textAlign,
          centerLetterSpacing: true,
        });

        const [call] = node.paintCalls();
        const [left, right] = inkOf(call);
        expect(node.size().x).toBeCloseTo(90);
        expect(left).toBeCloseTo(-right);
      });
    }

    it('reads the static default', () => {
      Txt.defaultCenterLetterSpacing = true;
      const node = probe({text: 'ABC', fontSize: 10, letterSpacing: 20});

      const [left, right] = inkOf(node.paintCalls()[0]);
      expect(left).toBeCloseTo(-right);
    });

    it('splits the gap around each line of a wider box', () => {
      const node = probe({
        text: 'ABC',
        fontSize: 10,
        letterSpacing: 20,
        width: 200,
        centerLetterSpacing: true,
      });

      const [left] = inkOf(node.paintCalls()[0]);
      expect(left).toBeCloseTo(-100 + 10);
    });

    it('keeps split pieces where the text paints them', () => {
      Txt.defaultCenterLetterSpacing = true;
      const node = probe({text: 'ABC', fontSize: 10, letterSpacing: 20});
      const [left] = inkOf(node.paintCalls()[0]);

      const pieces = node.split('grapheme').map(piece => {
        add(piece);
        const {calls, context} = recordingTextContext();
        piece.render(context);
        return inkOf(calls[0])[0] + piece.x();
      });

      pieces.forEach((pieceLeft, index) =>
        expect(pieceLeft).toBeCloseTo(left + index * (CHAR_WIDTH + 20)),
      );
    });
  });

  it('paints wrapped right-to-left lines inside the box', () => {
    const node = probe({
      text: 'אבגד הוזח טיכל',
      fontSize: 10,
      width: 60,
      textDirection: 'rtl',
    });

    const calls = node.paintCalls();
    const words = node.textWords();
    expect(calls).toHaveLength(3);
    calls.forEach((call, index) => {
      const [left, right] = inkOf(call);
      expect(call.direction).toBe('rtl');
      expect(left).toBeGreaterThanOrEqual(-30);
      expect(right).toBeLessThanOrEqual(30);
      expect(left).toBeCloseTo(words[index].x - words[index].width / 2);
    });
  });
});
