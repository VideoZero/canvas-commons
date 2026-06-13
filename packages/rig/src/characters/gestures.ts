import type {Rig} from '../skeleton';
import {rotateDeg} from '../util/vec';
import type {Pose} from './bind';

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
