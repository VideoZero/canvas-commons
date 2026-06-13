import {Vector2} from '@motion-canvas/core';

/**
 * FABRIK — Forward And Backward Reaching Inverse Kinematics.
 *
 * Solves a chain of `lengths.length` bones so the LAST joint reaches `target`
 * while the FIRST stays pinned at `base`, preserving every bone length. `seed`
 * is the current joint configuration (n+1 points); seeding biases the solution
 * (e.g. a knee "pole") so it bends consistently instead of flipping.
 *
 * Cost is `O(iterations · bones)`. Each solve runs at most
 * {@link Fabrik.defaultIterations} passes (override per call), bailing early
 * once the effector is within {@link Fabrik.tolerance} of the target — so an
 * already-solved chain costs a single pass. Tune the static defaults to trade
 * accuracy for compute across the whole app.
 */
export class Fabrik {
  /** Default maximum passes per solve. Lower = cheaper, less exact. */
  static defaultIterations = 10;
  /** Effector-to-target distance (px) below which a solve stops early. */
  static tolerance = 0.01;

  static solve(
    base: Vector2,
    target: Vector2,
    lengths: number[],
    seed: Vector2[],
    iterations: number = Fabrik.defaultIterations,
  ): Vector2[] {
    const n = lengths.length;
    const pts = seed.slice();
    const reach = lengths.reduce((a, b) => a + b, 0);

    if (target.sub(base).magnitude >= reach) {
      const dir = target.sub(base).normalized;
      pts[0] = base;
      for (let i = 0; i < n; i++) pts[i + 1] = pts[i].add(dir.scale(lengths[i]));
      return pts;
    }

    for (let it = 0; it < iterations; it++) {
      pts[n] = target; // backward reach
      for (let i = n - 1; i >= 0; i--) {
        pts[i] = pts[i + 1].add(pts[i].sub(pts[i + 1]).normalized.scale(lengths[i]));
      }
      pts[0] = base; // forward reach
      for (let i = 0; i < n; i++) {
        pts[i + 1] = pts[i].add(pts[i + 1].sub(pts[i]).normalized.scale(lengths[i]));
      }
      if (pts[n].sub(target).magnitude < Fabrik.tolerance) break;
    }
    return pts;
  }
}

/**
 * Convenience wrapper around {@link Fabrik.solve}. Omit `iterations` to use the
 * global {@link Fabrik.defaultIterations}.
 */
export function fabrik(
  base: Vector2,
  target: Vector2,
  lengths: number[],
  seed: Vector2[],
  iterations?: number,
): Vector2[] {
  return Fabrik.solve(base, target, lengths, seed, iterations ?? Fabrik.defaultIterations);
}
