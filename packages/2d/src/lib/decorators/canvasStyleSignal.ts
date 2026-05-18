import {Color, Signal} from '@motion-canvas/core';
import {Gradient, Pattern} from '../partials';
import type {CanvasStyle, PossibleCanvasStyle} from '../partials';
import {canvasStyleParser} from '../utils';
import {initial, interpolation, parser, signal} from './signal';

export type CanvasStyleSignal<T> = Signal<PossibleCanvasStyle, CanvasStyle, T>;

/**
 * Tween between fill/stroke values that may be `null`, `Color`,
 * `Gradient`, or `Pattern`. Routes gradient combinations through
 * `Gradient.lerp` (which handles `Color ↔ Gradient` by treating the
 * colour as a uniform-stop gradient); falls back to a discrete swap
 * for `Pattern` since pixel data can't be interpolated meaningfully.
 */
function canvasStyleLerp(
  from: CanvasStyle,
  to: CanvasStyle,
  value: number,
): CanvasStyle {
  if (from instanceof Pattern || to instanceof Pattern) {
    return value < 0.5 ? from : to;
  }
  if (from instanceof Gradient || to instanceof Gradient) {
    return Gradient.lerp(
      from as Gradient | Color | null,
      to as Gradient | Color | null,
      value,
    );
  }
  return Color.lerp(from, to, value);
}

export function canvasStyleSignal(): PropertyDecorator {
  return (target, key) => {
    signal()(target, key);
    parser(canvasStyleParser)(target, key);
    interpolation(canvasStyleLerp)(target, key);
    initial(null)(target, key);
  };
}
