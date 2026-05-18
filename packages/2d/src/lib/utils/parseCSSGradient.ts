import {Gradient, GradientStop} from '../partials';

/**
 * Parses a CSS gradient string (`linear-gradient(...)`,
 * `radial-gradient(...)`, or `conic-gradient(...)`, including the
 * `repeating-*` variants which we collapse to the non-repeating form)
 * into a Motion Canvas `Gradient` instance. Returns `null` when the
 * input isn't a CSS gradient at all, or `null` when parsing fails so
 * the caller can fall back to its own degrade-to-first-stop path.
 *
 * The emitted gradient uses `cssRelative: true` so it auto-fits the
 * painted shape's bbox at render time (see `Gradient.canvasGradient`).
 * Linear gradients encode the direction as a unit vector via from/to;
 * radial gradients use a 0-1 fromRadius/toRadius scaled by the bbox
 * half-diagonal; conic gradients use the bbox centre and stored angle.
 */

const GRADIENT_RE =
  /^\s*(?:repeating-)?(linear|radial|conic)-gradient\s*\(([\s\S]*)\)\s*$/i;

/** Split a top-level argument list by commas, respecting nested parens. */
function splitTopLevel(body: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < body.length; i++) {
    const c = body[i];
    if (c === '(') depth++;
    else if (c === ')') depth--;
    else if (c === ',' && depth === 0) {
      out.push(body.slice(start, i).trim());
      start = i + 1;
    }
  }
  const last = body.slice(start).trim();
  if (last) out.push(last);
  return out;
}

/**
 * Quick heuristic: does this token look like a CSS color (start of a
 * color stop) or a config keyword (angle, "to <side>", "circle", "at
 * center", etc.)? Colors start with `#`, `rgb(`, `rgba(`, `hsl(`,
 * `hsla(`, or are a known named color. Configs start with `to`,
 * `from`, `at`, `circle`, `ellipse`, `closest-*`, `farthest-*`, or a
 * bare number followed by an angle unit.
 */
function looksLikeColor(token: string): boolean {
  if (!token) return false;
  const t = token.trim().toLowerCase();
  if (t.startsWith('#')) return true;
  if (/^(?:rgba?|hsla?)\s*\(/.test(t)) return true;
  // Strip trailing offset (`#abc 50%`) before keyword check.
  const first = t.split(/\s+/)[0];
  if (NAMED_COLORS.has(first)) return true;
  return false;
}

/** Small allowlist of CSS named colors agents reach for. Not exhaustive. */
const NAMED_COLORS = new Set([
  'black','white','red','green','blue','yellow','cyan','magenta',
  'gray','grey','silver','maroon','olive','lime','aqua','teal',
  'navy','fuchsia','purple','orange','pink','brown','transparent',
  'currentcolor',
]);

const ANGLE_RE = /^(-?[\d.]+)\s*(deg|rad|turn|grad)?$/i;

function parseAngleDeg(token: string): number | null {
  const m = token.trim().match(ANGLE_RE);
  if (!m) return null;
  const n = parseFloat(m[1]);
  if (!Number.isFinite(n)) return null;
  const unit = (m[2] ?? 'deg').toLowerCase();
  switch (unit) {
    case 'deg': return n;
    case 'rad': return (n * 180) / Math.PI;
    case 'turn': return n * 360;
    case 'grad': return (n * 360) / 400;
    default: return n;
  }
}

/** "to right" / "to top left" → CSS angle in degrees (0 = up, CW). */
function sideKeywordToAngle(spec: string): number | null {
  const tokens = spec.trim().toLowerCase().split(/\s+/);
  if (tokens[0] !== 'to') return null;
  const sides = tokens.slice(1).sort().join(' ');
  switch (sides) {
    case 'top':          return 0;
    case 'right top':    return 45;
    case 'right':        return 90;
    case 'bottom right': return 135;
    case 'bottom':       return 180;
    case 'bottom left':  return 225;
    case 'left':         return 270;
    case 'left top':     return 315;
    default: return null;
  }
}

/**
 * Parse a single color-stop spec like `"#abc"`, `"#abc 50%"`, or
 * `"rgb(0,0,0) 100px"`. Returns the color string and the parsed offset
 * in [0,1] or null when no offset / unit unsupported.
 */
function parseStop(spec: string): {color: string; offset: number | null} | null {
  const trimmed = spec.trim();
  // Pull the colour off the front. Need to handle `rgb(0, 0, 0)` with
  // commas inside parens — find the matching `)` then anything after
  // is the offset.
  let colorEnd = -1;
  if (trimmed.startsWith('rgb') || trimmed.startsWith('hsl') ||
      trimmed.startsWith('RGB') || trimmed.startsWith('HSL')) {
    const close = trimmed.indexOf(')');
    if (close < 0) return null;
    colorEnd = close + 1;
  } else {
    // Hex or named: color ends at first whitespace.
    const ws = trimmed.search(/\s/);
    colorEnd = ws < 0 ? trimmed.length : ws;
  }
  const color = trimmed.slice(0, colorEnd).trim();
  if (!color) return null;
  const rest = trimmed.slice(colorEnd).trim();
  if (!rest) return {color, offset: null};
  // Offset: percentage or px. We honor % directly; px we can't resolve
  // without the bbox, so treat as missing (caller redistributes).
  if (rest.endsWith('%')) {
    const n = parseFloat(rest);
    if (!Number.isFinite(n)) return {color, offset: null};
    return {color, offset: Math.max(0, Math.min(1, n / 100))};
  }
  // px or unitless: ignore offset.
  return {color, offset: null};
}

/**
 * Walk the parsed stops and fill in missing offsets. Stops without an
 * explicit offset get evenly distributed between their neighbors.
 * Replicates the CSS gradient spec's default distribution.
 */
function assignOffsets(stops: {color: string; offset: number | null}[]): GradientStop[] {
  if (stops.length === 0) return [];
  // Anchor first/last when not set.
  if (stops[0].offset == null) stops[0].offset = 0;
  if (stops[stops.length - 1].offset == null) stops[stops.length - 1].offset = 1;

  // Forward pass — ensure monotonic non-decreasing.
  for (let i = 1; i < stops.length; i++) {
    const prev = stops[i - 1].offset!;
    if (stops[i].offset != null && stops[i].offset! < prev) {
      stops[i].offset = prev;
    }
  }

  // Fill gaps between known offsets.
  let i = 0;
  while (i < stops.length) {
    if (stops[i].offset != null) {
      i++;
      continue;
    }
    let j = i;
    while (j < stops.length && stops[j].offset == null) j++;
    const left = stops[i - 1].offset!;
    const right = stops[j]?.offset ?? 1;
    const span = j - i + 1;
    for (let k = 0; k < j - i; k++) {
      stops[i + k].offset = left + ((right - left) * (k + 1)) / (span);
    }
    i = j;
  }

  return stops.map(s => ({offset: s.offset!, color: s.color}));
}

/** Convert a CSS angle (0deg = up, clockwise) into a unit vector in
 *  screen coordinates (+y points down). */
function cssAngleToUnitVector(deg: number): {x: number; y: number} {
  const rad = (deg * Math.PI) / 180;
  return {x: Math.sin(rad), y: -Math.cos(rad)};
}

export function parseCSSGradient(value: string): Gradient | null {
  if (typeof value !== 'string') return null;
  const m = value.match(GRADIENT_RE);
  if (!m) return null;
  const type = m[1].toLowerCase() as 'linear' | 'radial' | 'conic';
  const parts = splitTopLevel(m[2]);
  if (parts.length === 0) return null;

  // Tease apart optional leading config part(s) from the stops list.
  let configIdx = 0;
  while (configIdx < parts.length && !looksLikeColor(parts[configIdx])) {
    configIdx++;
  }
  const configParts = parts.slice(0, configIdx);
  const rawStops = parts.slice(configIdx);
  if (rawStops.length === 0) return null;

  const parsedStops = rawStops.map(parseStop).filter((s): s is {color: string; offset: number | null} => !!s);
  if (parsedStops.length === 0) return null;
  const stops = assignOffsets(parsedStops);

  if (type === 'linear') {
    // Default angle is "to bottom" (180deg) per CSS spec.
    let angleDeg = 180;
    if (configParts.length) {
      const cfg = configParts.join(', ');
      const parsedAngle = parseAngleDeg(cfg);
      if (parsedAngle != null) angleDeg = parsedAngle;
      else {
        const sideAngle = sideKeywordToAngle(cfg);
        if (sideAngle != null) angleDeg = sideAngle;
      }
    }
    const dir = cssAngleToUnitVector(angleDeg);
    try {
      // from/to encode the direction as a unit vector — the actual
      // gradient endpoints are derived from the painted shape's bbox
      // at render time (see Gradient.canvasGradient cssRelative path).
      return new Gradient({
        type: 'linear',
        from: [-dir.x, -dir.y],
        to: [dir.x, dir.y],
        stops,
        cssRelative: true,
      });
    } catch {
      return null;
    }
  }

  if (type === 'radial') {
    // Config tokens are mostly ignored beyond center detection ("at X Y").
    // Defaults: centred at the shape's bbox centre, radius scaled to
    // cover the bbox corners.
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

  // type === 'conic'
  let fromAngleDeg = 0;
  for (const cfg of configParts) {
    const t = cfg.trim().toLowerCase();
    if (t.startsWith('from ')) {
      const parsed = parseAngleDeg(t.slice(5).trim());
      if (parsed != null) fromAngleDeg = parsed;
    }
  }
  try {
    return new Gradient({
      type: 'conic',
      from: [0, 0],
      angle: (fromAngleDeg * Math.PI) / 180,
      stops,
      cssRelative: true,
    });
  } catch {
    return null;
  }
}
