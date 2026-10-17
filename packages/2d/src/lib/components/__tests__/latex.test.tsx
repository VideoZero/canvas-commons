import {SerializedVector2, Vector2} from '@canvas-commons/core';
import {describe, expect, it} from 'vitest';
import {Latex, Node, Rect, SVGDocument, SVGShapeData} from '..';
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
});
