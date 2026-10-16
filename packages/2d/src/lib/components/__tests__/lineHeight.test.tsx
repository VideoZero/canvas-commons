import {useLogger} from '@motion-canvas/core';
import {afterEach, describe, expect, it, vi} from 'vitest';
import {Layout} from '../Layout';
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

describe('Layout.warnTightLineHeight', () => {
  mockScene2D();

  afterEach(() => {
    Layout.warnTightLineHeight = false;
    vi.restoreAllMocks();
  });

  function warnings(...nodes: Txt[]) {
    const warn = vi.spyOn(useLogger(), 'warn');
    Layout.warnTightLineHeight = true;
    nodes.forEach(node => cssLineHeight(node));
    return warn.mock.calls.map(([payload]) => (payload as any).message);
  }

  it('warns once when lines overlap', () => {
    const node = (
      <Txt fontSize={112} lineHeight={20}>
        {'TWO\nLINES'}
      </Txt>
    ) as Txt;
    expect(warnings(node, node)).toEqual([
      'Txt "TWO LINES" has a 20px line height at font size 112, so its lines overlap.',
    ]);
  });

  it('stays quiet for usual line heights and empty text', () => {
    expect(
      warnings(
        (
          <Txt fontSize={112} lineHeight={1.25}>
            A
          </Txt>
        ) as Txt,
        (
          <Txt fontSize={112} lineHeight={'90%'}>
            A
          </Txt>
        ) as Txt,
        (
          <Txt fontSize={112} lineHeight={100}>
            A
          </Txt>
        ) as Txt,
        (<Txt fontSize={112} lineHeight={20} />) as Txt,
      ),
    ).toEqual([]);
  });

  it('is off by default', () => {
    const warn = vi.spyOn(useLogger(), 'warn');
    cssLineHeight(
      (
        <Txt fontSize={112} lineHeight={20}>
          A
        </Txt>
      ) as Txt,
    );
    expect(warn).not.toHaveBeenCalled();
  });
});
