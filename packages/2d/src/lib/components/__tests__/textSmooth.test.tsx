import {afterEach, describe, expect, it, vi} from 'vitest';
import {TextAlign} from '../../partials';
import {Txt, TxtProps} from '../Txt';
import {failOnSceneErrors} from './failOnSceneErrors';
import {mockScene2D} from './mockScene2D';
import {mockTextContext} from './mockTextContext';
import {PaintCall, recordingTextContext} from './recordingTextContext';
import {add, kernedWidth} from './sceneFixtures';

const SmoothAngle = 0.001;

class Probe extends Txt {
  public probeDraw(context: CanvasRenderingContext2D) {
    this.draw(context);
  }

  public probeCacheBBox() {
    return this.getCacheBBox();
  }
}

function paint(node: Probe): {calls: PaintCall[]; rotations: number[]} {
  const {calls, context} = recordingTextContext();
  const rotate = context.rotate.bind(context);
  const rotations: number[] = [];
  context.rotate = vi.fn((angle: number) => {
    rotations.push(angle);
    rotate(angle);
  });
  node.probeDraw(context);
  return {calls, rotations};
}

function probe(props: TxtProps): Probe {
  const node = new Probe(props);
  add(node);
  return node;
}

describe('Txt smooth', () => {
  mockScene2D();
  failOnSceneErrors();
  mockTextContext(kernedWidth);

  afterEach(() => {
    Txt.defaultSmooth = false;
  });

  const paragraph: TxtProps = {
    text: 'AVA tilts gently over a long line',
    fontSize: 10,
    lineHeight: 20,
    width: 120,
  };

  it('is off by default and paints without rotating', () => {
    const node = probe(paragraph);
    expect(node.smooth()).toBe(false);
    const {calls, rotations} = paint(node);
    expect(calls.length).toBeGreaterThan(1);
    expect(rotations).toEqual([]);
    expect(calls.every(call => call.angle === 0)).toBe(true);
  });

  const Cases: [string, Partial<TxtProps>][] = [
    ['left', {}],
    ...(['center', 'right', 'justify'] as TextAlign[]).map(
      (textAlign): [string, Partial<TxtProps>] => [textAlign, {textAlign}],
    ),
    ['justified rtl', {textAlign: 'justify', textDirection: 'rtl'}],
    ['rtl', {textDirection: 'rtl'}],
  ];

  for (const [name, extra] of Cases) {
    it(`tilts each ${name} run around its own anchor`, () => {
      const plain = paint(probe({...paragraph, ...extra}));
      const smooth = paint(probe({...paragraph, ...extra, smooth: true}));

      expect(smooth.calls.length).toBe(plain.calls.length);
      expect(smooth.rotations).toEqual(smooth.calls.map(() => SmoothAngle));
      smooth.calls.forEach((call, index) => {
        const reference = plain.calls[index];
        expect(call.angle).toBeCloseTo(SmoothAngle, 12);
        expect(call.text).toBe(reference.text);
        expect(call.x).toBe(reference.x);
        expect(call.y).toBe(reference.y);
        expect(call.penX).toBeCloseTo(reference.penX, 9);
        expect(call.penY).toBeCloseTo(reference.penY, 9);
      });
    });
  }

  it('leaves layout, bounds and measurement untouched', () => {
    const plain = probe(paragraph);
    const smooth = probe({...paragraph, smooth: true});
    expect(smooth.size()).toEqual(plain.size());
    expect(smooth.probeCacheBBox()).toEqual(plain.probeCacheBBox());
    expect(smooth.textGlyphs()).toEqual(plain.textGlyphs());
    const withoutSmooth = (node: Txt) =>
      node.textLines().lines.map(line => ({
        ...line,
        fragments: line.fragments.map(({style, ...fragment}) => ({
          ...fragment,
          style: {...style, smooth: false},
        })),
      }));
    expect(withoutSmooth(smooth)).toEqual(withoutSmooth(plain));
  });

  it('takes the default at creation', () => {
    Txt.defaultSmooth = true;
    const on = probe(paragraph);
    Txt.defaultSmooth = false;
    const off = probe(paragraph);
    expect(on.smooth()).toBe(true);
    expect(off.smooth()).toBe(false);
    expect(paint(on).calls.every(call => call.angle === SmoothAngle)).toBe(
      true,
    );
  });

  it('is inherited by nested runs unless they set it', () => {
    const inherited = new Txt({text: 'b'});
    const opted = new Txt({text: 'c', smooth: false});
    const node = probe({
      fontSize: 10,
      smooth: true,
      children: ['a ', inherited, ' ', opted],
    });
    expect(inherited.smooth()).toBe(true);
    expect(opted.smooth()).toBe(false);

    const angles = Object.fromEntries(
      paint(node)
        .calls.filter(call => call.text.trim() !== '')
        .map(call => [call.text.trim(), call.angle]),
    );
    expect(angles).toEqual({a: SmoothAngle, b: SmoothAngle, c: 0});
  });

  it('is copied to split pieces from their own run', () => {
    const node = probe({
      fontSize: 10,
      smooth: true,
      children: ['ab', new Txt({text: 'c', smooth: false})],
    });
    const pieces = node.split('grapheme');
    expect(pieces.map(piece => [piece.text(), piece.smooth()])).toEqual([
      ['a', true],
      ['b', true],
      ['c', false],
    ]);
    expect(probe({text: 'ab', fontSize: 10}).split()[0].smooth()).toBe(false);
  });

  it('tilts each glyph on a path around its own position', () => {
    const path = {text: 'hi', fontSize: 10, textPath: 'M 0 0 L 100 0'};
    const plain = paint(probe(path));
    const smooth = paint(probe({...path, smooth: true}));
    expect(smooth.calls.length).toBe(plain.calls.length);
    smooth.calls.forEach((call, index) => {
      const reference = plain.calls[index];
      expect(call.angle - reference.angle).toBeCloseTo(SmoothAngle, 12);
      expect(call.x).toBe(reference.x);
      expect(call.y).toBe(reference.y);
    });
  });
});
