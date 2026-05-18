import {Gradient, GradientStop} from '../partials';

/**
 * Resolve a CSS `url(#id)` paint reference (typically the computed
 * value of `fill`/`stroke` when an SVG element references a
 * `<linearGradient>` or `<radialGradient>` in `<defs>`) into a Motion
 * Canvas `Gradient` instance. Returns `null` when the input isn't a
 * `url(...)` ref, when the referenced element is missing, or when the
 * target isn't a gradient — callers fall back to the inherited paint.
 *
 * Coordinate model: SVG gradients are sized either relative to the
 * shape's bbox (`objectBoundingBox`, default) or in user space
 * (`userSpaceOnUse`). We emit `cssRelative: true` gradients so the
 * actual endpoints are computed from the painted shape's bbox at
 * render time. For linear we encode the direction from `x1/y1`→`x2/y2`
 * as a unit vector; for radial we centre at the bbox centre and span
 * the bbox half-diagonal. All stops are surfaced (not just the first).
 */

const URL_RE = /^url\(\s*['"]?#([^'")\s]+)['"]?\s*\)\s*$/i;

export function resolveSvgPaintServer(
  value: string,
  svgRoot: Element,
): Gradient | null {
  const match = value.match(URL_RE);
  if (!match) return null;
  const id = match[1];

  // Scope the lookup to the parsed SVG so multiple SVGs on the same
  // page with the same gradient id don't cross-pollinate. Use an
  // attribute selector to avoid CSS.escape compatibility concerns.
  const target = svgRoot.querySelector(
    `[id="${id.replace(/"/g, '\\"')}"]`,
  );
  if (!target) return null;

  const tag = target.tagName.toLowerCase();
  if (tag !== 'lineargradient' && tag !== 'radialgradient') return null;

  const stops = collectGradientStops(target);
  if (stops.length === 0) return null;

  if (tag === 'lineargradient') {
    // Default x1=0,y1=0,x2=1,y2=0 per SVG spec (horizontal L→R).
    const x1 = parseFloat(target.getAttribute('x1') ?? '0');
    const y1 = parseFloat(target.getAttribute('y1') ?? '0');
    const x2 = parseFloat(target.getAttribute('x2') ?? '1');
    const y2 = parseFloat(target.getAttribute('y2') ?? '0');
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len = Math.hypot(dx, dy) || 1;
    const ux = dx / len;
    const uy = dy / len;
    try {
      return new Gradient({
        type: 'linear',
        from: [-ux, -uy],
        to: [ux, uy],
        stops,
        cssRelative: true,
      });
    } catch {
      return null;
    }
  }

  // radialGradient — centred radial covering the surrounding shape.
  try {
    return new Gradient({
      type: 'radial',
      from: [0, 0],
      fromRadius: 0,
      to: [0, 0],
      toRadius: 1,
      stops,
      cssRelative: true,
    });
  } catch {
    return null;
  }
}

/**
 * Read `<stop>` children of a gradient element into Motion Canvas
 * `GradientStop` entries. Offsets are clamped to [0,1]; colours come
 * from `stop-color` (via getComputedStyle so cascaded styles work).
 */
function collectGradientStops(gradient: Element): GradientStop[] {
  const stopEls = Array.from(gradient.querySelectorAll('stop'));
  if (stopEls.length === 0) return [];
  const out: GradientStop[] = [];
  for (let i = 0; i < stopEls.length; i++) {
    const el = stopEls[i];
    const rawOffset =
      el.getAttribute('offset') ??
      (stopEls.length > 1 ? `${i / (stopEls.length - 1)}` : '0');
    let offset = rawOffset.trim().endsWith('%')
      ? parseFloat(rawOffset) / 100
      : parseFloat(rawOffset);
    if (!Number.isFinite(offset)) offset = 0;
    offset = Math.max(0, Math.min(1, offset));

    const cs = window.getComputedStyle(el);
    const color =
      cs.stopColor ||
      el.getAttribute('stop-color') ||
      '#000000';
    out.push({offset, color});
  }
  return out;
}
