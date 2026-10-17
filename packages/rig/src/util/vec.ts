import {Vector2} from '@canvas-commons/core';

/**
 * Rotate a vector by `deg` degrees (clockwise on screen, where +y points
 * down).
 *
 * @example
 * ```ts
 * rotateDeg(new Vector2(10, 0), 90); // Vector2(0, 10)
 * ```
 *
 * @param v - The vector to rotate.
 * @param deg - The angle in degrees.
 */
export function rotateDeg(v: Vector2, deg: number): Vector2 {
  const a = (deg * Math.PI) / 180;
  const c = Math.cos(a);
  const s = Math.sin(a);
  return new Vector2(v.x * c - v.y * s, v.x * s + v.y * c);
}

/**
 * Hermite smoothstep on `[0, 1]`: an ease-in-out with zero slope at both
 * ends.
 *
 * @example
 * ```ts
 * smoothstep(0.5); // 0.5
 * ```
 *
 * @param s - The input in `[0, 1]`.
 */
export function smoothstep(s: number): number {
  return s * s * (3 - 2 * s);
}
