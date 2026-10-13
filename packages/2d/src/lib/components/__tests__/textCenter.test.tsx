import {useLogger} from '@motion-canvas/core';
import {afterEach, beforeAll, describe, expect, it, vi} from 'vitest';
import {Layout} from '../Layout';
import {Rect} from '../Rect';
import {Txt} from '../Txt';
import {TxtLeaf} from '../TxtLeaf';
import {mockScene2D} from './mockScene2D';

// jsdom has no canvas: fake metrics proportional to the font size.
// Line box: ascent 0.9, descent 0.3. Caps 0.7 high; lowercase 0.5; descenders 0.2.
function fakeContext() {
  let size = 0;
  return {
    set font(value: string) {
      size = parseFloat(value.match(/(\d+(?:\.\d+)?)px/)![1]);
    },
    measureText(text: string) {
      return {
        fontBoundingBoxAscent: 0.9 * size,
        fontBoundingBoxDescent: 0.3 * size,
        actualBoundingBoxAscent: (/[A-Z0-9]/.test(text) ? 0.7 : 0.5) * size,
        actualBoundingBoxDescent: (/[gjpqy]/.test(text) ? 0.2 : 0) * size,
      };
    },
  };
}

describe('Txt.textCenter', () => {
  mockScene2D();

  beforeAll(() => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(
      () => fakeContext() as any,
    );
  });

  afterEach(() => {
    Txt.defaultTextCenter = 'cap';
    Layout.warnIgnoredPosition = false;
  });

  it('centers the cap band by default', () => {
    // (0.7 - 0 - 0.9 + 0.3) / 2 * 40
    const node = (<Txt fontSize={40}>Hello</Txt>) as Txt;
    expect(node.textCenterOffset()).toBeCloseTo(2);
    expect(node.childAs<TxtLeaf>(0)!.y()).toBe(2);
  });

  it('recomputes when the font size changes', () => {
    const node = (<Txt fontSize={40}>Hello</Txt>) as Txt;
    expect(node.textCenterOffset()).toBeCloseTo(2);
    node.fontSize(80);
    expect(node.textCenterOffset()).toBeCloseTo(4);
  });

  it('keeps the line box with "line" and the static default', () => {
    expect(
      ((<Txt fontSize={40} textCenter="line">Hello</Txt>) as Txt).textCenterOffset(),
    ).toBe(0);
    Txt.defaultTextCenter = 'line';
    expect(((<Txt fontSize={40}>Hello</Txt>) as Txt).textCenterOffset()).toBe(0);
  });

  it('centers the ink and follows text changes', () => {
    // (0.5 - 0.2 - 0.9 + 0.3) / 2 * 40
    const node = (<Txt fontSize={40} textCenter="ink">gap</Txt>) as Txt;
    expect(node.textCenterOffset()).toBeCloseTo(-6);
    node.text('HI');
    expect(node.textCenterOffset()).toBeCloseTo(2);
  });

  it('falls back to ink for text without caps', () => {
    // CJK: lowercase-like metrics in the fake context, no descenders.
    const node = (<Txt fontSize={40}>数据</Txt>) as Txt;
    expect(node.textCenterOffset()).toBeCloseTo(-2);
  });

  it('keeps tracking the text after a split', () => {
    const node = (<Txt fontSize={40} textCenter="ink">gap</Txt>) as Txt;
    // While split, text() returns a stored copy (split() needs DOM ranges,
    // which jsdom lacks, so set the state it leaves behind).
    (node as any).splitOriginalText = 'gap';
    node.fontSize(40.5);
    node.textCenterOffset();
    (node as any).splitOriginalText = null;
    node.childAs<TxtLeaf>(0)!.text('HI');
    expect(node.textCenterOffset()).toBeCloseTo(0.05 * 40.5);
  });

  it('applies the outermost offset to nested text', () => {
    const inner = (<Txt fontSize={80}>B</Txt>) as Txt;
    const outer = (
      <Txt fontSize={40}>
        a {inner}
      </Txt>
    ) as Txt;
    expect(inner.textCenterOffset()).toBe(outer.textCenterOffset());
  });

  it('shares the largest offset between baseline-aligned siblings', () => {
    const big = (<Txt fontSize={80}>42</Txt>) as Txt;
    const small = (<Txt fontSize={20}>%</Txt>) as Txt;
    <Layout layout alignItems="baseline">
      {big}
      {small}
    </Layout>;
    expect(big.textCenterOffset()).toBeCloseTo(4);
    expect(small.textCenterOffset()).toBeCloseTo(4);
  });

  it('ignores baseline alignment without a layout parent', () => {
    const node = (<Txt fontSize={40} alignSelf="baseline">Hello</Txt>) as Txt;
    expect(node.textCenterOffset()).toBeCloseTo(2);
  });
});

describe('Layout.warnIgnoredPosition', () => {
  mockScene2D();

  afterEach(() => {
    Layout.warnIgnoredPosition = false;
  });

  it('warns once for a positioned layout child', () => {
    const warn = vi.spyOn(useLogger(), 'warn');
    const child = (<Rect x={5} />) as Rect;
    const free = (<Rect />) as Rect;
    <Layout layout>
      {child}
      {free}
    </Layout>;

    child.x();
    expect(warn).not.toHaveBeenCalled();

    Layout.warnIgnoredPosition = true;
    child.x();
    child.y();
    free.x();
    expect(warn).toHaveBeenCalledTimes(1);
  });
});
