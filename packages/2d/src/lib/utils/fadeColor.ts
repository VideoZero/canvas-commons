import {Color, unwrap} from '@canvas-commons/core';
import {CanvasStyle, Gradient} from '../partials';

/**
 * A color that can stand in for a paint while it fades in or out.
 *
 * @remarks
 * A gradient lends its middle stop. A pattern, or a gradient without stops,
 * lends nothing.
 *
 * @param paint - The paint to fade.
 */
export function fadeColor(paint: CanvasStyle): Color | null {
  if (paint instanceof Color) return paint;
  if (paint instanceof Gradient) {
    const stops = paint.stops();
    const stop = stops[Math.floor(stops.length / 2)];
    return stop ? new Color(unwrap(stop.color)) : null;
  }
  return null;
}
