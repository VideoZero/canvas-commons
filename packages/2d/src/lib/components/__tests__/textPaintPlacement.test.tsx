import {describe, expect, it} from 'vitest';
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
