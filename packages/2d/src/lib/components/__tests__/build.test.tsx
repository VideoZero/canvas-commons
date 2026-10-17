import {Color, all, createSignal, linear, waitFor} from '@canvas-commons/core';
import {describe, expect, it} from 'vitest';
import {Curve, Latex, Line, Path, SVG} from '..';
import {generatorTest} from './generatorTest';
import {mockScene2D} from './mockScene2D';
import {polyfillSVGDom} from './svgDom';

class TestLine extends Line {
  public progress() {
    return this.buildProgress();
  }
}

function hex(style: unknown) {
  return style instanceof Color ? style.hex() : style;
}

function line() {
  return new TestLine({
    points: [
      [0, 0],
      [100, 0],
    ],
    stroke: 'white',
    lineWidth: 2,
  });
}

const DOCUMENT =
  '<svg viewBox="0 0 10 10"><path id="filled" fill="currentColor" d="M0 0L1 0L1 1Z"/><path id="stroked" stroke="rgb(255,0,0)" stroke-width="2" d="M0 0L5 5"/></svg>';

function paths(svg: SVG): Path[] {
  return svg.orderedCurveDescendants().filter(curve => curve instanceof Path);
}

describe('build', () => {
  mockScene2D();
  polyfillSVGDom();

  describe('Curve', () => {
    it(
      'traces the curve and fades the fill in',
      generatorTest(function* () {
        const fill = createSignal(new Color('rgb(255,0,0)'));
        const curve = line();
        curve.fill(fill);

        yield curve.build(1, linear);
        yield* waitFor(0.5);
        expect(curve.progress()).toBeCloseTo(0.5, 1);
        expect(curve.fill()).toBeNull();
        expect(curve.end()).toBe(1);

        yield* waitFor(0.6);
        expect(curve.progress()).toBe(1);
        fill(new Color('rgb(0,0,255)'));
        expect(hex(curve.fill())).toBe('#0000ff');
      }),
    );
  });

  describe('SVG', () => {
    it(
      'draws every shape on and gives back its paint',
      generatorTest(function* () {
        const svg = new SVG({svg: DOCUMENT, fill: 'rgb(0,255,0)'});
        const [filled, stroked] = paths(svg);

        yield svg.build(2);
        yield* waitFor(0.1);
        expect(filled.fill()).toBeNull();
        expect(filled.end()).toBeLessThan(1);
        expect(stroked.end()).toBe(0);

        yield* waitFor(2);
        expect(hex(filled.fill())).toBe('#00ff00');
        expect(filled.stroke()).toBeNull();
        expect(filled.end()).toBe(1);
        expect(stroked.end()).toBe(1);
        expect(stroked.lineWidth()).toBe(2);

        svg.fill('rgb(0,0,255)');
        expect(hex(filled.fill())).toBe('#0000ff');
      }),
    );

    it(
      'borrows an outline for a shape without a stroke',
      generatorTest(function* () {
        const svg = new SVG({svg: DOCUMENT, fill: 'rgb(0,255,0)'});
        const [filled] = paths(svg);

        yield svg.build(2, undefined, {outlineWidth: 3});
        yield* waitFor(0.2);
        expect(filled.lineWidth()).toBe(3);
        expect(hex(filled.stroke())).toBe('#00ff00');
      }),
    );

    it(
      'fades a shape in without an outline',
      generatorTest(function* () {
        const svg = new SVG({svg: DOCUMENT, fill: 'rgb(0,255,0)'});
        const [filled] = paths(svg);

        yield svg.build(2, undefined, {outline: false});
        yield* waitFor(0.2);
        expect(filled.end()).toBe(1);
        expect(filled.lineWidth()).toBe(0);
        const fill = filled.fill();
        expect(fill instanceof Color && fill.alpha()).toBeGreaterThan(0);
      }),
    );

    it(
      'draws the document off and on again',
      generatorTest(function* () {
        const svg = new SVG({svg: DOCUMENT, fill: 'rgb(0,255,0)'});
        const [filled, stroked] = paths(svg);

        yield* svg.unbuild(1);
        expect(filled.fill()).toBeNull();
        expect(filled.end()).toBe(0);
        expect(stroked.end()).toBe(0);
        expect(filled.lineWidth()).toBe(0);

        yield* svg.build(1);
        expect(hex(filled.fill())).toBe('#00ff00');
        expect(stroked.end()).toBe(1);
      }),
    );

    it(
      'plays a random order the same way every time',
      generatorTest(function* () {
        const first = new SVG({svg: DOCUMENT});
        const second = new SVG({svg: DOCUMENT});

        yield* all(
          first.build(1, undefined, {order: 'random', overlap: 0}),
          second.build(1, undefined, {order: 'random', overlap: 0}),
        );
        expect(paths(first).map(curve => curve.end())).toEqual([1, 1]);
      }),
    );

    it('lists the curves in document order', () => {
      const svg = new SVG({svg: DOCUMENT});

      expect(svg.orderedCurveDescendants().every(c => c instanceof Curve)).toBe(
        true,
      );
      expect(svg.orderedCurveDescendants()).toHaveLength(2);
    });
  });

  describe('Latex', () => {
    it(
      'grows the glyphs in within the duration',
      generatorTest(function* () {
        const latex = new Latex({tex: 'abc', fill: 'white'});
        const glyphs = latex.orderedCurveDescendants();
        const scales = glyphs.map(glyph => glyph.scale());
        expect(glyphs.length).toBe(3);

        yield latex.build(1);
        yield* waitFor(0.05);
        expect(glyphs[2].opacity()).toBe(0);

        yield* waitFor(1);
        glyphs.forEach((glyph, index) => {
          expect(glyph.opacity()).toBe(1);
          expect(glyph.scale().equals(scales[index])).toBe(true);
        });
      }),
    );
  });
});
