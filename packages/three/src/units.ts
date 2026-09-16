/**
 * How many Motion Canvas pixels make one Three.js world unit.
 *
 * @remarks
 * Every 3D node takes positions and sizes in pixels, like the rest of Motion
 * Canvas: a `300` px box next to a `300` px {@link Rect} reads the same size at
 * the camera target plane. Internally the 3D nodes sit in a group scaled by
 * `1 / PIXELS_PER_UNIT`, so Three.js sees metre-ish units: point-light
 * falloff and shadow cameras behave like in any Three.js tutorial, and camera
 * near/far planes stay in a comfortable range.
 *
 * Objects you add to a raw `scene` yourself live outside that group, in
 * world units: a glTF model authored 1.8 units tall renders 180 px tall
 * there. The same model inside an {@link Object3D} node is in pixels, so it
 * renders 1.8 px tall until you scale it by `PIXELS_PER_UNIT`.
 */
export const PIXELS_PER_UNIT = 100;

/**
 * A point in 3D, in pixels.
 *
 * @remarks
 * `x` grows to the right and `y` grows DOWN, matching 2D nodes — so a mesh at
 * `y={-100}` sits above the centre, exactly like a {@link Rect} would. `z`
 * grows toward the camera. (Three.js itself is y-up; the conversion is done
 * for you, and imported models keep their up axis.)
 */
export type PossibleVector3 = [number, number, number];

export function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}
