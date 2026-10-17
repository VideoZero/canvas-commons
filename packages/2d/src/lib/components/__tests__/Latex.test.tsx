import {Color} from '@canvas-commons/core';
import {describe, expect, it} from 'vitest';
import {Latex, Path} from '..';
import {mockScene2D} from './mockScene2D';
import {polyfillSVGDom} from './svgDom';

function glyphs(tex: string, fill = 'rgb(255,255,255)') {
  const latex = new Latex({tex, fill});
  return latex.wrapper.findAll((node): node is Path => node instanceof Path);
}

function hex(style: unknown) {
  return style instanceof Color ? style.hex() : style;
}

describe('Latex', () => {
  mockScene2D();
  polyfillSVGDom();

  it('paints glyphs with the fill of the node', () => {
    const paths = glyphs('x^2 + y', 'rgb(255,0,0)');

    expect(paths.length).toBeGreaterThanOrEqual(4);
    for (const path of paths) {
      expect(hex(path.fill())).toBe('#ff0000');
    }
  });

  it('paints glyphs with a color set in the source', () => {
    const paths = glyphs('a\\color{rgb(0,0,255)}{b}');

    expect(paths.map(path => hex(path.fill()))).toEqual(['#ffffff', '#0000ff']);
  });

  it('renders stretchy delimiters', () => {
    const paths = glyphs(
      '\\left(\\begin{matrix}a\\\\b\\\\c\\\\d\\end{matrix}\\right)',
    );

    expect(paths.length).toBeGreaterThanOrEqual(6);
    for (const path of paths) {
      expect(path.data()).not.toBe('');
      expect(Number.isFinite(path.position.x())).toBe(true);
    }
  });
});
