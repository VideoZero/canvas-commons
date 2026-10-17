import {afterEach, describe, expect, it} from 'vitest';
import {Txt, TxtProps} from '../Txt';
import {mockScene2D} from './mockScene2D';
import {mockTextContext} from './mockTextContext';
import {recordingTextContext} from './recordingTextContext';
import {add, fontSizeOf} from './sceneFixtures';

class Probe extends Txt {
  public paintedBaselines(): number[] {
    const {calls, context} = recordingTextContext();
    this.draw(context);
    return calls.map(call => call.penY);
  }
}

function probe(props: TxtProps): Probe {
  const node = new Probe(props);
  add(node);
  return node;
}

describe('Txt.textCenter', () => {
  mockScene2D();
  // Font box: ascent 0.9, descent 0.3. Caps 0.7 high, lowercase 0.5,
  // descenders 0.2 deep.
  mockTextContext(
    10,
    ({font}) => ({
      ascent: 0.9 * fontSizeOf(font),
      descent: 0.3 * fontSizeOf(font),
    }),
    (text, {font}) => ({
      ascent: (/[A-Z0-9]/.test(text) ? 0.7 : 0.5) * fontSizeOf(font),
      descent: (/[gjpqy]/.test(text) ? 0.2 : 0) * fontSizeOf(font),
    }),
  );

  afterEach(() => {
    Txt.defaultTextCenter = 'line';
  });

  it('keeps the line box by default', () => {
    const node = probe({fontSize: 40, text: 'Hello'});
    expect(node.textCenterOffset()).toBe(0);
  });

  it('centers the cap band', () => {
    // (0.7 - 0 - 0.9 + 0.3) / 2 * 40
    const line = probe({fontSize: 40, text: 'Hello'});
    const cap = probe({fontSize: 40, text: 'Hello', textCenter: 'cap'});
    expect(cap.textCenterOffset()).toBeCloseTo(2);
    expect(cap.paintedBaselines()[0]).toBeCloseTo(
      line.paintedBaselines()[0] + 2,
    );
  });

  it('reads the static default', () => {
    Txt.defaultTextCenter = 'cap';
    expect(probe({fontSize: 40, text: 'Hello'}).textCenterOffset()).toBeCloseTo(
      2,
    );
    expect(
      probe({
        fontSize: 40,
        text: 'Hello',
        textCenter: 'line',
      }).textCenterOffset(),
    ).toBe(0);
  });

  it('recomputes when the font size changes', () => {
    const node = probe({fontSize: 40, text: 'Hello', textCenter: 'cap'});
    expect(node.textCenterOffset()).toBeCloseTo(2);
    node.fontSize(80);
    expect(node.textCenterOffset()).toBeCloseTo(4);
  });

  it('centers the ink and follows text changes', () => {
    // (0.5 - 0.2 - 0.9 + 0.3) / 2 * 40
    const node = probe({fontSize: 40, text: 'gap', textCenter: 'ink'});
    expect(node.textCenterOffset()).toBeCloseTo(-6);
    node.text('HI');
    expect(node.textCenterOffset()).toBeCloseTo(2);
  });

  it('centers the ink of text without caps', () => {
    const node = probe({fontSize: 40, text: '数据', textCenter: 'cap'});
    expect(node.textCenterOffset()).toBeCloseTo(-2);
  });

  it('moves nested text with its root', () => {
    const inner = new Txt({fontSize: 80, text: 'B'});
    const outer = probe({
      fontSize: 40,
      textCenter: 'cap',
      children: ['a ', inner],
    });
    expect(outer.textCenterOffset()).toBeCloseTo(2);
    expect(inner.textCenterOffset()).toBe(outer.textCenterOffset());
  });

  it('moves the units with the glyphs', () => {
    const line = probe({fontSize: 40, text: 'Hi there'});
    const cap = probe({fontSize: 40, text: 'Hi there', textCenter: 'cap'});
    const lineWords = line.textWords();
    const capWords = cap.textWords();
    expect(capWords).toHaveLength(lineWords.length);
    capWords.forEach((word, index) =>
      expect(word.y).toBeCloseTo(lineWords[index].y + 2),
    );
    expect(cap.size()).toEqual(line.size());
  });

  it('leaves text on a path to pathAlign', () => {
    const node = probe({
      fontSize: 40,
      text: 'Hello',
      textCenter: 'cap',
      textPath: 'M 0 0 L 400 0',
    });
    expect(node.textCenterOffset()).toBe(0);
  });
});
