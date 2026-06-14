import {Vector2} from '@motion-canvas/core';
import {fabrik} from '../ik';
import type {Rig} from '../skeleton';
import {smoothstep} from '../util/vec';

export interface FootTargetOptions {
  /** World x where the walk begins (matches the body's `startX`). */
  startX: number;
  /** Ground level — the world y the foot is planted on. */
  groundY: number;
  /** Forward distance travelled per full stride. */
  stride: number;
  /** Peak foot clearance during the swing phase. */
  lift: number;
  /** This leg's hip x-offset from the body root (so feet plant under hips). */
  hipOffsetX?: number;
  /** Gait phase offset in [0,1) — e.g. 0.5 for the opposite leg. */
  phase?: number;
  /**
   * Stance **duty factor**: the fraction of the cycle the foot is planted
   * (default 0.5). This sets the gait's character — a bipedal walk/run sits
   * around 0.5, while a quadruped *walk* needs > 0.5 (≈0.7) so at least three
   * feet stay grounded and the body doesn't hop. Lower → more airborne (a run).
   */
  duty?: number;
  /** Fraction of a stride the contact point leads the hip (default 0.25). */
  plantLead?: number;
}

export interface PlantedFootOptions extends FootTargetOptions {
  /** Seconds per stride. */
  period: number;
}

/**
 * The shared **ground-interaction primitive**: the world-space target for a foot
 * at gait-phase `cyc` (in cycles — `t / period + phase` for a constant cadence,
 * or an accumulated `∫ v/stride dt` for a variable-speed controller).
 *
 * Each cycle is `duty` stance + `(1 - duty)` swing. During **stance** the foot is
 * pinned to a fixed point on a world lattice spaced exactly `stride` apart, so it
 * never slides and the swing ends precisely where the next stance begins (no
 * replant pop). During **swing** it eases forward one stride (smoothstep) and
 * arcs up by `lift`.
 *
 * This is only the TARGET — solve the leg to it with FABRIK via
 * {@link solveLimb}. Both {@link plantedFoot} (constant cadence: walk / run /
 * quadruped) and the `locomotion` controller (variable speed) build on this, so
 * every gait shares one foot/ground model.
 */
export function plantedFootAt(cyc: number, opts: FootTargetOptions): Vector2 {
  const {startX, groundY, stride, lift, hipOffsetX = 0, phase = 0, duty = 0.5, plantLead = 0.25} = opts;
  const n = Math.floor(cyc);
  const f = cyc - n;
  const plantX = startX + hipOffsetX + stride * plantLead + stride * (n - phase);
  if (f < duty) return new Vector2(plantX, groundY); // stance: contact pinned to the lattice
  const s = (f - duty) / (1 - duty);
  return new Vector2(plantX + stride * smoothstep(s), groundY - lift * Math.sin(Math.PI * s));
}

/**
 * Constant-cadence planted foot at time `t` — {@link plantedFootAt} evaluated at
 * gait-phase `t / period + phase`. Drive the body forward at `stride / period`
 * px·s⁻¹, phase each leg, and feed this into {@link solveLimb}. For a believable
 * quadruped walk, phase the four legs evenly (0, 0.25, 0.5, 0.75) with `duty ≈ 0.7`.
 */
export function plantedFoot(t: number, opts: PlantedFootOptions): Vector2 {
  return plantedFootAt(t / opts.period + (opts.phase ?? 0), opts);
}

export interface WalkBodyOptions {
  startX: number;
  speed: number; // px·s⁻¹ — keep equal to stride / period for no foot slide
  groundY: number;
  stand: number; // hip height above ground
  period: number;
  bob?: number; // vertical bounce amplitude (default 3)
}

/**
 * World-space body (root) position for a walk cycle: advances at constant
 * `speed` and bobs twice per stride. Keep `speed === stride / period` so the
 * planted feet from {@link plantedFoot} stay locked to the ground.
 */
export function walkBody(t: number, opts: WalkBodyOptions): Vector2 {
  const bob = opts.bob ?? 3;
  return new Vector2(
    opts.startX + opts.speed * t,
    opts.groundY - opts.stand - bob * Math.cos(4 * Math.PI * (t / opts.period - 0.25)),
  );
}

/**
 * Solve an IK limb (e.g. hip→knee→ankle) so its effector reaches `target` while
 * its base stays at `base`, with a stable bend direction. Returns the solved
 * joint positions (base … effector); the caller writes them into its pose.
 *
 * `bendBias` nudges the interior joints' seed sideways (in +x) so the limb bends
 * consistently — positive for a knee that leads forward, negative to flip it.
 */
export function solveLimb(
  rig: Rig,
  roles: string[],
  base: Vector2,
  target: Vector2,
  bendBias = 16,
): Vector2[] {
  const lengths: number[] = [];
  for (let i = 0; i < roles.length - 1; i++) {
    lengths.push(rig.boneLength(roles[i], roles[i + 1]));
  }
  const total = lengths.reduce((a, b) => a + b, 0) || 1;
  // Seed along the base→target line, interior joints pushed toward the bend pole.
  const seed: Vector2[] = [base];
  let acc = 0;
  for (let i = 0; i < lengths.length; i++) {
    acc += lengths[i];
    if (i === lengths.length - 1) {
      seed.push(target);
    } else {
      seed.push(base.add(target.sub(base).scale(acc / total)).add(new Vector2(bendBias, 0)));
    }
  }
  return fabrik(base, target, lengths, seed);
}
