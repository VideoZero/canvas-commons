import {Vector2} from '@motion-canvas/core';
import type {Rig} from '../skeleton';
import {rotateDeg} from '../util/vec';
import type {Pose} from './bind';
import type {PoseLayer} from './compose';

export interface WaveOptions {
  shoulder: string; // joint role at the chain base
  elbow: string;
  wrist?: string; // optional — animated only if the rig defines it
  /** Angle (deg) the upper arm is held raised at, about the shoulder (default -108). */
  raise?: number;
  /**
   * Extra elbow flex (deg) added on top of the arm's rest bend (default 0).
   * Keep it small: a large negative value pushes the forearm past straight and
   * the elbow hyperextends. The oscillation already stays within the rest flex.
   */
  bend?: number;
  /** Hand oscillation amplitude (deg), swung about the ELBOW (default 16). */
  amplitude?: number;
  /** Oscillation frequency (default 7). */
  frequency?: number;
}

/**
 * Wave: hold the upper arm raised and steady while the forearm/hand oscillates
 * about the elbow — which is what a wave actually is. Mutates the pose `m` in
 * place (call after the base pose has placed the shoulder).
 *
 * For the elbow to articulate visibly, the forearm should be its own rendered
 * part (`data-rig-part`) pivoting at the elbow. If the rig has no separate wrist
 * joint, only the upper arm is raised.
 */
export function wave(rig: Rig, m: Pose, t: number, opts: WaveOptions): void {
  const off = (r: string) => rig.restOffset(r);
  const raise = opts.raise ?? -108;
  const sh = m[opts.shoulder];
  if (!sh) return;
  const el = sh.add(rotateDeg(off(opts.elbow).sub(off(opts.shoulder)), raise)); // upper arm steady
  m[opts.elbow] = el;
  if (opts.wrist && rig.joints[opts.wrist]) {
    // The forearm rotates by the SAME `raise` (keeping the rest elbow flex) plus
    // a small `bend` and the wave oscillation — so the elbow stays flexed and
    // never crosses straight (no hyperextension).
    const forearm =
      raise + (opts.bend ?? 0) + Math.sin(t * (opts.frequency ?? 7)) * (opts.amplitude ?? 16);
    m[opts.wrist] = el.add(rotateDeg(off(opts.wrist).sub(off(opts.elbow)), forearm)); // hand waves
  }
}

export interface NodOptions {
  /** Pitch amplitude in degrees (default 12). */
  amplitude?: number;
  /** Seconds per nod (default 0.9). */
  period?: number;
  /** Joint the head rotates about (default 'neck'). */
  pivot?: string;
  /** Head joint that pitches (default 'headCenter'). */
  head?: string;
}

/**
 * Overlay: nod the head — pitch `head` about `pivot` (a head-shake set
 * `axis`-style is just a different sign/pivot). Works on any rig with a neck and
 * head joint, so both bipeds and quadrupeds can use it. Keep the base pose's
 * `pivot` placement intact (call after the base).
 */
export function nod(rig: Rig, opts: NodOptions = {}): PoseLayer {
  const amp = opts.amplitude ?? 12;
  const period = opts.period ?? 0.9;
  const pivotRole = opts.pivot ?? 'neck';
  const headRole = opts.head ?? 'headCenter';
  return (t, pose) => {
    const pivot = pose[pivotRole];
    if (!pivot || !rig.joints[headRole]) return;
    const rest = rig.restOffset(headRole).sub(rig.restOffset(pivotRole));
    const deg = Math.sin((2 * Math.PI * t) / period) * amp;
    pose[headRole] = pivot.add(rotateDeg(rest, deg));
  };
}

export interface LookAtOptions {
  /** World-space point to look toward. */
  target: Vector2;
  /** Clamp head rotation to ±this many degrees from rest (default 70). */
  maxAngle?: number;
  /** Joint the head rotates about (default 'neck'). */
  pivot?: string;
  /** Head joint that aims (default 'headCenter'). */
  head?: string;
}

/**
 * Overlay: aim the head at a fixed world `target`, rotating `head` about `pivot`
 * and clamping to `±maxAngle` from its rest direction so it never snaps around.
 * Pure in `t` only if `target` is constant; pass a per-frame target for tracking.
 */
export function lookAt(rig: Rig, opts: LookAtOptions): PoseLayer {
  const maxAngle = opts.maxAngle ?? 70;
  const pivotRole = opts.pivot ?? 'neck';
  const headRole = opts.head ?? 'headCenter';
  return (_t, pose) => {
    const pivot = pose[pivotRole];
    if (!pivot || !rig.joints[headRole]) return;
    const rest = rig.restOffset(headRole).sub(rig.restOffset(pivotRole));
    const want = opts.target.sub(pivot);
    if (want.magnitude < 1e-3) return;
    // Signed angle from the rest head direction to the target direction.
    let deg = (Math.atan2(want.y, want.x) - Math.atan2(rest.y, rest.x)) * (180 / Math.PI);
    while (deg > 180) deg -= 360;
    while (deg < -180) deg += 360;
    deg = Math.max(-maxAngle, Math.min(maxAngle, deg));
    pose[headRole] = pivot.add(rotateDeg(rest, deg));
  };
}
