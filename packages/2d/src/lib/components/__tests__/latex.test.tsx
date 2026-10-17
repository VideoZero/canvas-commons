import {
  SerializedVector2,
  Vector2,
  linear,
  waitFor,
} from '@canvas-commons/core';
import {describe, expect, it} from 'vitest';
import {Latex, Node, Rect, SVGDocument, SVGShapeData} from '..';
import {generatorTest} from './generatorTest';
import {mockScene2D} from './mockScene2D';

const GLYPH = new Vector2(10, 20);
const SEPARATOR = '\u0000';

// jsdom cannot parse the SVG that MathJax emits, so each character of a part
// becomes a glyph of a fixed size, grouped the way Latex groups fragments.
class TestLatex extends Latex {
  public renderFragment(tex: string) {
    return this.subTexToSVG(tex);
  }

  protected override texToSvg(parts: string[]) {
    return parts.join(SEPARATOR);
  }

  protected override parseSVG(svg: string): SVGDocument {
    const parts = svg.split(SEPARATOR).filter(part => part.length > 0);
    const width = parts.join('').length * GLYPH.x;
    let x = -width / 2;
    const nodes = parts.map((part): SVGShapeData => {
      const children = [...part].map((char): SVGShapeData => {
        x += GLYPH.x;
        return {
          id: `glyph-${char}`,
          type: Rect,
          props: {position: [x - GLYPH.x / 2, 0], size: GLYPH},
        };
      });
      return {id: part.trim(), type: Node, props: {}, children};
    });

    return this.buildDocument({size: new Vector2(width, GLYPH.y), nodes});
  }

  protected override calculateWrapperScale(
    documentSize: Vector2,
    parentSize: SerializedVector2<number | null>,
  ): Vector2 {
    return parentSize.x || parentSize.y
      ? super.calculateWrapperScale(documentSize, parentSize)
      : Vector2.one;
  }
}

describe('Latex', () => {
  mockScene2D();

  describe('fragments', () => {
    it('keeps nested braces inside a fragment', () => {
      const tex = new Latex({tex: '{{e^{i\\pi}}} + {{1}}'});

      expect(tex.tex()).toEqual(['e^{i\\pi}', ' + ', '1']);
    });

    it('ends a fragment at the braces that close it', () => {
      const tex = new Latex({tex: '{{\\frac{a}{b}}}={{c}}'});

      expect(tex.tex()).toEqual(['\\frac{a}{b}', '=', 'c']);
    });

    it('ignores escaped braces when closing a fragment', () => {
      const tex = new Latex({tex: '{{\\{x\\}}}y'});

      expect(tex.tex()).toEqual(['\\{x\\}', 'y']);
    });

    it('keeps an unclosed fragment marker as tex', () => {
      const tex = new Latex({tex: 'a{{b'});

      expect(tex.tex()).toEqual(['a{{b']);
    });

    it.each(['a & b', '&', 'a &= b \\\\', '\\end{cases}', '\\begin{cases} a'])(
      'renders the fragment %j without a MathJax error',
      fragment => {
        const tex = new TestLatex({tex: 'x'});

        expect(tex.renderFragment(fragment)).not.toContain('data-mjx-error');
      },
    );
  });

  describe('fragment queries', () => {
    it('returns the shapes of each occurrence of a fragment', () => {
      const tex = new TestLatex({tex: '{{x}}+{{x}}'});

      const occurrences = tex.getShapesById('x');

      expect(occurrences).toHaveLength(2);
      expect(occurrences.map(shapes => shapes.length)).toEqual([1, 1]);
      expect(occurrences[0][0]).not.toBe(occurrences[1][0]);
      expect(tex.getShapes()).toHaveLength(3);
    });

    it('measures a fragment in each space', () => {
      const parent = new Node({position: [100, 0]});
      const tex = new TestLatex({tex: '{{ab}}{{c}}', position: [0, 50]});
      parent.add(tex);

      const [local] = tex.getLocalFragmentBBox('ab');
      expect(local.x).toBeCloseTo(-15);
      expect(local.width).toBeCloseTo(20);
      expect(local.height).toBeCloseTo(20);

      const [inParent] = tex.getFragmentBBox('ab', 2);
      expect(inParent.x).toBeCloseTo(-17);
      expect(inParent.y).toBeCloseTo(38);
      expect(inParent.width).toBeCloseTo(24);

      const [absolute] = tex.getAbsoluteFragmentBBox('ab');
      expect(absolute.x).toBeCloseTo(85);
      expect(absolute.y).toBeCloseTo(40);
    });
  });

  describe('tweening', () => {
    it(
      'animates the size when mapping fragments',
      generatorTest(function* (view) {
        const tex = new TestLatex({tex: '{{ab}}'});
        view.add(tex);
        expect(tex.width()).toBeCloseTo(20);

        yield tex.map('{{ab}}{{cd}}', [[0]], 1, linear);
        yield* waitFor(0.5);
        expect(tex.width()).toBeCloseTo(30, 0);

        yield* waitFor(0.6);
        expect(tex.width()).toBeCloseTo(40);
        expect(tex.width.isInitial()).toBe(true);
      }),
    );

    it(
      'keeps an explicit width after tweening the tex',
      generatorTest(function* (view) {
        const tex = new TestLatex({tex: '{{ab}}', width: 100});
        view.add(tex);

        yield* tex.tex('{{ab}}{{cd}}', 1, linear);

        expect(tex.width.isInitial()).toBe(false);
        expect(tex.width()).toBeCloseTo(100);
        expect(tex.height()).toBeCloseTo(50);
      }),
    );

    it(
      'scales the formula into an explicit width while tweening',
      generatorTest(function* (view) {
        const tex = new TestLatex({tex: '{{ab}}', width: 100});
        view.add(tex);
        expect(tex.wrapper.scale.x()).toBeCloseTo(5);

        yield tex.tex('{{ab}}{{cd}}', 1, linear);
        yield* waitFor(0.5);

        expect(tex.wrapper.scale.x()).toBeCloseTo(3.75, 1);
      }),
    );
  });
});
