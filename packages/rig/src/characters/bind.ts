import {Vector2} from '@motion-canvas/core';
import type {Rig} from '../skeleton';

/** A pose: every joint role mapped to its world-space position at time `t`. */
export type Pose = Record<string, Vector2>;

/** A pure function from time to a {@link Pose}. */
export type PoseFn = (t: number) => Pose;

/**
 * Drive a rig from a clock signal with a pure `pose(t)` function.
 *
 * Every joint signal is bound to read its own slot out of the pose, and the
 * pose is computed at most once per distinct clock value (a one-entry cache).
 * Because `pose` is a pure function of `t` — no stored velocity — scrubbing the
 * timeline is fully deterministic: seeking to a frame always yields the same
 * pose, forwards or backwards.
 *
 * Joints the pose omits fall back to their rest offset, so a pose may touch
 * only the joints it animates.
 */
export function bindPose(rig: Rig, clock: () => number, pose: PoseFn): void {
  let cache: {t: number; m: Pose} | null = null;
  const at = (t: number) => {
    if (!cache || cache.t !== t) cache = {t, m: pose(t)};
    return cache.m;
  };
  for (const role of Object.keys(rig.joints)) {
    rig.joints[role](() => at(clock())[role] ?? rig.restOffset(role));
  }
}
