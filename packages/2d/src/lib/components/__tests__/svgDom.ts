import {afterAll, beforeAll} from 'vitest';

const GRAPHICS = new Set([
  'circle',
  'ellipse',
  'g',
  'image',
  'line',
  'path',
  'polygon',
  'polyline',
  'rect',
  'svg',
  'use',
]);

function parseTransform(value: string | null): DOMMatrix | null {
  if (!value) return null;
  let matrix = new DOMMatrix();
  for (const [, name, args] of value.matchAll(/(\w+)\s*\(([^)]*)\)/g)) {
    const [a = 0, b, c, d, e, f] = args
      .trim()
      .split(/[\s,]+/)
      .map(Number);
    switch (name) {
      case 'matrix':
        matrix = matrix.multiply(new DOMMatrix([a, b, c, d, e, f]));
        break;
      case 'translate':
        matrix = matrix.translate(a, b ?? 0);
        break;
      case 'scale':
        matrix = matrix.scale(a, b ?? a);
        break;
      case 'rotate':
        matrix = matrix.rotate(a);
        break;
    }
  }
  return matrix;
}

/**
 * Give jsdom's SVG elements the parts of the SVG DOM that the parser reads.
 *
 * @remarks
 * jsdom builds most SVG children as plain `SVGElement`s with no `transform`
 * or `href`. Its root `<svg>` has no `width` or `height` either; that gap is
 * left in place, as Safari can show the same one.
 */
export function polyfillSVGDom() {
  const graphics = window.SVGGraphicsElement;
  const element = window.SVGElement.prototype;

  beforeAll(() => {
    Object.defineProperty(graphics, Symbol.hasInstance, {
      configurable: true,
      value: (value: unknown) =>
        value instanceof window.SVGElement && GRAPHICS.has(value.tagName),
    });
    Object.defineProperty(element, 'transform', {
      configurable: true,
      get(this: SVGElement) {
        const matrix = parseTransform(this.getAttribute('transform'));
        return {baseVal: {consolidate: () => (matrix ? {matrix} : null)}};
      },
    });
    Object.defineProperty(element, 'href', {
      configurable: true,
      get(this: SVGElement) {
        return {
          baseVal:
            this.getAttribute('href') ?? this.getAttribute('xlink:href') ?? '',
        };
      },
    });
  });

  afterAll(() => {
    Reflect.deleteProperty(graphics, Symbol.hasInstance);
    Reflect.deleteProperty(element, 'transform');
    Reflect.deleteProperty(element, 'href');
  });
}
