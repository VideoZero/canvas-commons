import {describe, expect, it} from 'vitest';
import {Txt} from '../Txt';
import {mockScene2D} from './mockScene2D';
import {mockTextContext} from './mockTextContext';
import {add, lineTexts} from './sceneFixtures';

function lines(txt: Txt): string[] {
  return lineTexts(txt).map(line => line.trim());
}

describe("textWrap 'balance'", () => {
  mockScene2D();
  mockTextContext();

  const text = 'aaaa bbbb cccc dddd eeee';

  it('wraps into lines of about the same width', () => {
    const greedy = new Txt({width: 200, text});
    const balanced = new Txt({width: 200, text, textWrap: 'balance'});
    add(greedy);
    add(balanced);

    expect(lines(greedy)).toEqual(['aaaa bbbb cccc dddd', 'eeee']);
    expect(lines(balanced)).toEqual(['aaaa bbbb cccc', 'dddd eeee']);
    expect(balanced.size().x).toBe(200);
  });

  it('keeps a line that fits', () => {
    const node = new Txt({width: 400, text, textWrap: 'balance'});
    add(node);
    expect(lines(node)).toEqual([text]);
  });

  it('takes no more lines than wrapping does', () => {
    const long = `${text} ffff gggg hhhh iiii jjjj kkkk`;
    const greedy = new Txt({width: 120, text: long});
    const balanced = new Txt({width: 120, text: long, textWrap: 'balance'});
    add(greedy);
    add(balanced);

    const widths = lines(balanced).map(line => line.length);
    expect(widths).toHaveLength(lines(greedy).length);
    expect(Math.max(...widths) - Math.min(...widths)).toBeLessThanOrEqual(5);
  });
});
