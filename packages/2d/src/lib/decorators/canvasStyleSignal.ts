import {Color, Signal} from '@canvas-commons/core';
import type {CanvasStyle, PossibleCanvasStyle} from '../partials';
import {Gradient, Pattern} from '../partials';
import {canvasStyleParser} from '../utils';
import {initial, interpolation, parser, signal} from './signal';

export type CanvasStyleSignal<T> = Signal<PossibleCanvasStyle, CanvasStyle, T>;

function canvasStyleLerp(
  from: CanvasStyle,
  to: CanvasStyle,
  value: number,
): CanvasStyle {
  if (from instanceof Pattern || to instanceof Pattern) {
    return value < 0.5 ? from : to;
  }
  if (from instanceof Gradient || to instanceof Gradient) {
    return Gradient.lerp(from, to, value);
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
