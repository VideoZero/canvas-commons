import {Color} from '@canvas-commons/core';
import {Gradient, GradientStop} from '../partials/Gradient';

const PAINT_SERVER = /^url\(\s*['"]?#([^'")\s]+)['"]?\s*\)\s*(.*)$/i;
const MAX_REFERENCES = 16;

function findById(root: Element, id: string): Element | null {
  for (const element of root.querySelectorAll('[id]')) {
    if (element.id === id) return element;
  }
  return null;
}

function isGradient(element: Element | null): element is Element {
  const tag = element?.tagName.toLowerCase();
  return tag === 'lineargradient' || tag === 'radialgradient';
}

/**
 * The gradient and the ones it references through `href`, nearest first.
 */
function referenceChain(gradient: Element, root: Element): Element[] {
  const chain = [gradient];
  let current = gradient;
  while (chain.length < MAX_REFERENCES) {
    const href =
      current.getAttribute('href') ?? current.getAttribute('xlink:href');
    const referenced = href?.startsWith('#')
      ? findById(root, href.slice(1))
      : null;
    if (!isGradient(referenced) || chain.includes(referenced)) break;
    chain.push(referenced);
    current = referenced;
  }
  return chain;
}

function attribute(chain: Element[], name: string): string | null {
  for (const element of chain) {
    const value = element.getAttribute(name);
    if (value !== null) return value;
  }
  return null;
}

function number(
  chain: Element[],
  name: string,
  fallback: number,
  fraction: boolean,
): number {
  const value = attribute(chain, name)?.trim();
  if (!value) return fallback;
  const parsed = parseFloat(value);
  if (!Number.isFinite(parsed)) return fallback;
  return fraction && value.endsWith('%') ? parsed / 100 : parsed;
}

function stopProperty(stop: Element, name: string): string {
  return (
    (stop instanceof SVGElement ? stop.style.getPropertyValue(name) : '') ||
    stop.getAttribute(name) ||
    window.getComputedStyle(stop).getPropertyValue(name)
  );
}

function readStops(chain: Element[]): GradientStop[] {
  const owner = chain.find(element => element.querySelector('stop') !== null);
  if (!owner) return [];

  let previous = 0;
  return Array.from(owner.querySelectorAll('stop')).map(stop => {
    const raw = stop.getAttribute('offset')?.trim() ?? '0';
    const parsed = parseFloat(raw);
    const offset = Number.isFinite(parsed)
      ? raw.endsWith('%')
        ? parsed / 100
        : parsed
      : 0;
    previous = Math.max(previous, Math.min(1, Math.max(0, offset)));

    const value = stopProperty(stop, 'stop-color');
    const color =
      value && value !== 'currentColor' && Color.isValid(value)
        ? new Color(value)
        : new Color('black');
    const opacity = parseFloat(stopProperty(stop, 'stop-opacity'));
    return {
      offset: previous,
      color: Number.isFinite(opacity)
        ? color.alpha(color.alpha() * opacity)
        : color,
    };
  });
}

/**
 * Resolve an SVG paint server reference, such as `url(#shine)`, into a
 * {@link Gradient}.
 *
 * @remarks
 * Supports `<linearGradient>` and `<radialGradient>`, including stops and
 * attributes inherited from the gradients they reference through `href`.
 *
 * A gradient in `userSpaceOnUse` units keeps its coordinates, which are the
 * local coordinates of the path it paints. One in `objectBoundingBox` units,
 * the default, becomes a {@link Gradient.cssRelative} gradient that keeps its
 * direction and, for a radial one, its radius, but is centered on the shape.
 * `gradientTransform` and `spreadMethod` are ignored.
 *
 * @example
 * ```ts
 * const gradient = resolveSVGPaintServer('url(#shine)', svgElement);
 * ```
 *
 * @param value - The paint to resolve.
 * @param root - The element to look up the referenced gradient in.
 * @returns The gradient, the fallback paint given after the reference when
 *          there is no gradient to use, or `null` without either.
 */
export function resolveSVGPaintServer(
  value: string,
  root: Element,
): Gradient | string | null {
  const match = value.trim().match(PAINT_SERVER);
  if (!match) return null;
  const fallback = match[2].trim() || null;

  const element = findById(root, match[1]);
  if (!isGradient(element)) return fallback;

  const chain = referenceChain(element, root);
  const stops = readStops(chain);
  if (stops.length === 0) return fallback;

  const userSpace = attribute(chain, 'gradientUnits') === 'userSpaceOnUse';
  if (element.tagName.toLowerCase() === 'lineargradient') {
    const x1 = number(chain, 'x1', 0, !userSpace);
    const y1 = number(chain, 'y1', 0, !userSpace);
    const x2 = number(chain, 'x2', 1, !userSpace);
    const y2 = number(chain, 'y2', 0, !userSpace);
    if (x1 === x2 && y1 === y2) return fallback;
    return new Gradient({
      type: 'linear',
      from: [x1, y1],
      to: [x2, y2],
      stops,
      cssRelative: !userSpace,
    });
  }

  const r = number(chain, 'r', 0.5, !userSpace);
  const fr = number(chain, 'fr', 0, !userSpace);
  if (!userSpace) {
    return new Gradient({
      type: 'radial',
      fromRadius: fr * Math.SQRT2,
      toRadius: r * Math.SQRT2,
      stops,
      cssRelative: true,
    });
  }

  const cx = number(chain, 'cx', 0, false);
  const cy = number(chain, 'cy', 0, false);
  return new Gradient({
    type: 'radial',
    from: [number(chain, 'fx', cx, false), number(chain, 'fy', cy, false)],
    fromRadius: fr,
    to: [cx, cy],
    toRadius: r,
    stops,
  });
}
