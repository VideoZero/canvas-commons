import {describe, expect, it} from 'vitest';
import {Txt} from '../Txt';
import {mockScene2D} from './mockScene2D';

function cssLineHeight(node: Txt) {
  (node as any).applyFont();
  return (node as any).element.style.lineHeight as string;
}

describe('Layout.lineHeight', () => {
  mockScene2D();

  it('reads a number up to 4 as a multiplier', () => {
    expect(cssLineHeight((<Txt lineHeight={1.25}>A</Txt>) as Txt)).toBe('1.25');
    expect(cssLineHeight((<Txt lineHeight={0.9}>A</Txt>) as Txt)).toBe('0.9');
    expect(cssLineHeight((<Txt lineHeight={4}>A</Txt>) as Txt)).toBe('4');
  });

  it('reads other numbers as pixels', () => {
    expect(cssLineHeight((<Txt lineHeight={4.5}>A</Txt>) as Txt)).toBe('4.5px');
    expect(cssLineHeight((<Txt lineHeight={60}>A</Txt>) as Txt)).toBe('60px');
  });

  it('reads a percentage as a multiplier', () => {
    expect(cssLineHeight((<Txt lineHeight={'125%'}>A</Txt>) as Txt)).toBe(
      '1.25',
    );
    expect(cssLineHeight((<Txt>A</Txt>) as Txt)).toBe('1.2');
  });
});
