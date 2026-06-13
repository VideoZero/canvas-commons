import {Vector2} from '@motion-canvas/core';

/** Rotate a vector by `deg` degrees (clockwise in screen space, +y down). */
export function rotateDeg(v: Vector2, deg: number): Vector2 {
  const a = (deg * Math.PI) / 180;
  const c = Math.cos(a);
  const s = Math.sin(a);
  return new Vector2(v.x * c - v.y * s, v.x * s + v.y * c);
}

/** Hermite smoothstep on [0,1] — ease-in-out, zero slope at both ends. */
export function smoothstep(s: number): number {
  return s * s * (3 - 2 * s);
}
