import {Vector2} from '@canvas-commons/core';

/**
 * FABRIK (Forward And Backward Reaching Inverse Kinematics) solver.
 *
 * @remarks
 * Solves a chain of `lengths.length` bones so that the last joint reaches
 * `target` while the first one stays pinned at `base`, preserving every bone
 * length. `seed` is the current joint configuration (`lengths.length + 1`
 * points); it biases the solution, for example towards a knee "pole", so the
 * chain bends consistently instead of flipping.
 *
 * Each solve runs at most {@link Fabrik.defaultIterations} passes and stops
 * early once the effector is within {@link Fabrik.tolerance} of the target.
 *
 * @example
 * ```ts
 * const joints = Fabrik.solve(
 *   new Vector2(0, 0),
 *   new Vector2(80, 60),
 *   [60, 60],
 *   [new Vector2(0, 0), new Vector2(0, 60), new Vector2(0, 120)],
 * );
 * ```
 */
export class Fabrik {
  /**
   * The default maximum number of passes per solve.
   */
  public static defaultIterations = 10;
  /**
   * The effector-to-target distance (in pixels) below which a solve stops.
   */
  public static tolerance = 0.01;

  /**
   * Solve a chain.
   *
   * @param base - The world position of the first joint.
   * @param target - The world position the last joint should reach.
   * @param lengths - The length of each bone.
   * @param seed - The current joint positions, one more than `lengths`.
   * @param iterations - The maximum number of passes.
   *
   * @returns The solved joint positions, from base to effector.
   */
  public static solve(
    base: Vector2,
    target: Vector2,
    lengths: number[],
    seed: Vector2[],
    iterations: number = Fabrik.defaultIterations,
  ): Vector2[] {
    const n = lengths.length;
    const points = seed.slice();
    const reach = lengths.reduce((a, b) => a + b, 0);

    if (target.sub(base).magnitude >= reach) {
      const direction = target.sub(base).normalized;
      points[0] = base;
      for (let i = 0; i < n; i++) {
        points[i + 1] = points[i].add(direction.scale(lengths[i]));
      }
      return points;
    }

    for (let iteration = 0; iteration < iterations; iteration++) {
      points[n] = target;
      for (let i = n - 1; i >= 0; i--) {
        points[i] = points[i + 1].add(
          points[i].sub(points[i + 1]).normalized.scale(lengths[i]),
        );
      }
      points[0] = base;
      for (let i = 0; i < n; i++) {
        points[i + 1] = points[i].add(
          points[i + 1].sub(points[i]).normalized.scale(lengths[i]),
        );
      }
      if (points[n].sub(target).magnitude < Fabrik.tolerance) break;
    }
    return points;
  }
}

/**
 * Solve a chain with {@link Fabrik.solve}.
 *
 * @example
 * ```ts
 * const [hip, knee, ankle] = fabrik(hip0, footTarget, [thigh, shin], seed);
 * ```
 *
 * @param base - The world position of the first joint.
 * @param target - The world position the last joint should reach.
 * @param lengths - The length of each bone.
 * @param seed - The current joint positions, one more than `lengths`.
 * @param iterations - The maximum number of passes. Defaults to
 *                     {@link Fabrik.defaultIterations}.
 */
export function fabrik(
  base: Vector2,
  target: Vector2,
  lengths: number[],
  seed: Vector2[],
  iterations: number = Fabrik.defaultIterations,
): Vector2[] {
  return Fabrik.solve(base, target, lengths, seed, iterations);
}
