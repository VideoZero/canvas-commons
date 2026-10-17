import {Vector2} from '@canvas-commons/core';
import type {Pose} from './bind';

export interface SpringChainOptions {
  /** Number of trailing segments (joints `p1…pCount`; `p0` is the anchor). */
  count: number;
  /** Length of each segment, in scene px. */
  segment: number;
  /** World position of the anchor (`p0`). Defaults to the origin. */
  base?: Vector2;
  /** Rest direction of the chain, in radians (default π/2 — straight down). */
  baseAngle?: number;
  /** Temporal frequency of the driving wave (default 2.2). */
  frequency?: number;
  /** Extra phase lag added per segment — the source of the trailing look (default 0.6). */
  lagPerSegment?: number;
  /** Sway amplitude (radians) at the base segment (default 0.35). */
  swayBase?: number;
  /** Additional sway amplitude accumulated toward the tip (default 0.6). */
  swayTip?: number;
  /** Gain of the global anchor drive mixed into every segment (default 0.15). */
  drive?: number;
  /** Joint-role namer; defaults to `p0, p1, …`. */
  role?: (i: number) => string;
}

/**
 * A springy trailing chain — a whip, tail, tentacle, antenna, or rope.
 *
 * Each segment follows the one before it with a growing phase lag and growing
 * sway amplitude toward the tip, producing a traveling wave that reads as a soft
 * body with intrinsic drag and weight (secondary motion). It is a **pure
 * function of `t`** — no stored velocity — so timeline scrubbing stays
 * deterministic. Pair with {@link bindPose} and a {@link curveTemplate}.
 *
 * @example
 * ```ts
 * const tail = new Rig(syntheticChar(points, viewBox), curveTemplate(6));
 * bindPose(tail, clock, t => springChain(t, {count: 6, segment: 20}));
 * ```
 */
export function springChain(t: number, opts: SpringChainOptions): Pose {
  const {
    count,
    segment,
    base = new Vector2(0, 0),
    baseAngle = Math.PI / 2,
    frequency = 2.2,
    lagPerSegment = 0.6,
    swayBase = 0.35,
    swayTip = 0.6,
    drive: driveGain = 0.15,
    role = (i: number) => `p${i}`,
  } = opts;

  const drive = Math.sin(t * frequency);
  const m: Pose = {[role(0)]: base};
  let pos = base;
  for (let i = 1; i <= count; i++) {
    const lag = i * lagPerSegment;
    const amp = swayBase + (i / count) * swayTip; // heavier sway toward the tip
    const ang =
      baseAngle + Math.sin(t * frequency - lag) * amp + drive * driveGain;
    pos = pos.add(new Vector2(Math.cos(ang), Math.sin(ang)).scale(segment));
    m[role(i)] = pos;
  }
  return m;
}
