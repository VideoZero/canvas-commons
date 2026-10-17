import {Color, DEG2RAD, Vector2} from '@canvas-commons/core';
import {Gradient, GradientStop} from '../partials/Gradient';

const GRADIENT =
  /^\s*(?:repeating-)?(linear|radial|conic)-gradient\s*\(([\s\S]*)\)\s*$/i;
const ANGLE = /^([+-]?(?:\d+\.?\d*|\.\d+))(deg|rad|turn|grad)?$/i;
const POSITION = /^([+-]?(?:\d+\.?\d*|\.\d+))(%|deg|rad|turn|grad|[a-z]+)?$/i;
const SIDES = new Map([
  ['top', 0],
  ['right top', 45],
  ['right', 90],
  ['bottom right', 135],
  ['bottom', 180],
  ['bottom left', 225],
  ['left', 270],
  ['left top', 315],
]);

interface ParsedStop {
  color: string;
  offset: number | null;
}

function splitTopLevel(text: string, separator: RegExp): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = '';
  for (const char of text) {
    if (char === '(') depth++;
    if (char === ')') depth--;
    if (depth === 0 && separator.test(char)) {
      if (current.trim()) parts.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  if (current.trim()) parts.push(current.trim());
  return parts;
}

function parseAngle(text: string): number | null {
  const match = text.trim().match(ANGLE);
  if (!match) return null;
  const value = parseFloat(match[1]);
  switch (match[2]?.toLowerCase()) {
    case 'rad':
      return value / DEG2RAD;
    case 'turn':
      return value * 360;
    case 'grad':
      return value * 0.9;
    case 'deg':
      return value;
    default:
      return value === 0 ? 0 : null;
  }
}

function parseOffset(text: string, angular: boolean): number | null {
  const match = text.match(POSITION);
  if (!match) return null;
  const value = parseFloat(match[1]);
  const unit = match[2]?.toLowerCase() ?? '';
  if (unit === '%') return value / 100;
  if (unit === '' && value === 0) return 0;
  if (angular) {
    const angle = parseAngle(text);
    return angle === null ? null : angle / 360;
  }
  return null;
}

function parseStops(args: string[], angular: boolean): ParsedStop[] | null {
  const stops: ParsedStop[] = [];
  for (const arg of args) {
    const tokens = splitTopLevel(arg, /\s/);
    const offsets: (number | null)[] = [];
    while (tokens.length > 1 && offsets.length < 2) {
      const last = tokens[tokens.length - 1];
      if (!POSITION.test(last)) break;
      offsets.unshift(parseOffset(last, angular));
      tokens.pop();
    }

    const color = tokens.join(' ');
    if (!Color.isValid(color)) return null;
    if (offsets.length === 0) offsets.push(null);
    for (const offset of offsets) {
      stops.push({color, offset});
    }
  }
  return stops.length > 0 ? stops : null;
}

function placeStops(stops: ParsedStop[]): GradientStop[] {
  const offsets = stops.map(stop => stop.offset);
  offsets[0] ??= 0;
  offsets[offsets.length - 1] ??= 1;

  let previous = 0;
  for (let i = 0; i < offsets.length; i++) {
    const offset = offsets[i];
    if (offset === null) continue;
    previous = Math.max(previous, offset);
    offsets[i] = previous;
  }

  let known = 0;
  for (let i = 1; i < offsets.length; i++) {
    const next = offsets[i];
    if (next === null) continue;
    const start = offsets[known] ?? 0;
    for (let j = known + 1; j < i; j++) {
      offsets[j] = start + ((next - start) * (j - known)) / (i - known);
    }
    known = i;
  }

  return stops.map(({color}, index) => ({
    color,
    offset: Math.min(1, Math.max(0, offsets[index] ?? 0)),
  }));
}

function linearDirection(config: string | null): Vector2 | null {
  let degrees = 180;
  if (config !== null) {
    const tokens = config.toLowerCase().split(/\s+/);
    const side =
      tokens[0] === 'to'
        ? SIDES.get(tokens.slice(1).sort().join(' '))
        : undefined;
    const angle = side ?? parseAngle(config);
    if (angle === null) return null;
    degrees = angle;
  }
  return new Vector2(Math.sin(degrees * DEG2RAD), -Math.cos(degrees * DEG2RAD));
}

function conicAngle(config: string | null): number | null {
  if (config === null) return 0;
  const match = config.toLowerCase().match(/^from\s+(\S+)/);
  if (!match) return config.toLowerCase().startsWith('at ') ? 0 : null;
  return parseAngle(match[1]);
}

/**
 * Parse a CSS gradient into a {@link Gradient} that fits the shape it paints.
 *
 * @remarks
 * Supports `linear-gradient()`, `radial-gradient()` and `conic-gradient()`.
 * The gradients it returns are {@link Gradient.cssRelative}, so they fit the
 * box of the shape they paint like a CSS gradient fits its element.
 *
 * Some CSS features have no canvas equivalent and are approximated: a
 * `repeating-` gradient does not repeat, a radial gradient is a circle around
 * the center that reaches the corners whatever its shape, size and position,
 * a conic gradient is centered, a side or corner direction (`to top right`) is
 * a multiple of 45 degrees, and stop positions in units other than percents
 * (or angles, for a conic gradient) are spread out like missing ones.
 *
 * Shape `fill` and `stroke` accept CSS gradients directly and parse them with
 * this function.
 *
 * @example
 * ```tsx
 * <Rect size={200} fill={parseCSSGradient('linear-gradient(to right, red, blue)')} />
 * <Rect size={200} fill="linear-gradient(to right, red, blue)" />
 * ```
 *
 * @param value - The CSS gradient to parse.
 * @returns The gradient, or `null` when the value is not a CSS gradient this
 *          function can read.
 */
export function parseCSSGradient(value: string): Gradient | null {
  const match = value.match(GRADIENT);
  if (!match) return null;
  const type = match[1].toLowerCase();
  const args = splitTopLevel(match[2], /,/);
  if (args.length === 0) return null;

  const angular = type === 'conic';
  let config: string | null = null;
  let stops = parseStops(args, angular);
  if (!stops) {
    config = args[0];
    stops = parseStops(args.slice(1), angular);
  }
  if (!stops) return null;
  const placed = placeStops(stops);

  if (type === 'linear') {
    const direction = linearDirection(config);
    if (!direction) return null;
    return new Gradient({
      type: 'linear',
      from: direction.flipped,
      to: direction,
      stops: placed,
      cssRelative: true,
    });
  }

  if (type === 'radial') {
    return new Gradient({
      type: 'radial',
      fromRadius: 0,
      toRadius: 1,
      stops: placed,
      cssRelative: true,
    });
  }

  const angle = conicAngle(config);
  if (angle === null) return null;
  return new Gradient({
    type: 'conic',
    angle: (angle - 90) * DEG2RAD,
    stops: placed,
    cssRelative: true,
  });
}
