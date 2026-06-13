import {Vector2} from '@motion-canvas/core';
import type {Rig} from '../skeleton';
import {rotateDeg, smoothstep} from '../util/vec';
import type {Pose, PoseFn} from './bind';
import {solveLimb} from './walk';

/** A target ground speed (px·s⁻¹) the body should reach by clip-local time `t`. */
export interface SpeedKey {
  t: number;
  speed: number;
}

export interface LocomotionOptions {
  startX?: number;
  groundY?: number;
  /**
   * Speed timeline. The target speed ramps smoothly (smoothstep) between
   * successive keys; before the first / after the last it holds flat.
   */
  speed: SpeedKey[];
  bendBias?: number;
  /** Speed (px·s⁻¹) treated as "fully running" for gait shaping (default 260). */
  runSpeed?: number;
  /**
   * Torso inertia. Higher `stiffness` snaps the torso back faster; lower
   * `damping` lets it overshoot more when the body accelerates or stops.
   * Defaults give a clear, brief overshoot on deceleration.
   */
  stiffness?: number;
  damping?: number;
  /** Degrees of torso lean per px of inertial deviation (default 0.9). */
  leanGain?: number;
}

const DT = 1 / 240; // fixed integration step → deterministic under seek

function targetSpeedAt(keys: SpeedKey[], t: number): number {
  if (t <= keys[0].t) return keys[0].speed;
  for (let i = 1; i < keys.length; i++) {
    if (t <= keys[i].t) {
      const a = keys[i - 1];
      const b = keys[i];
      return a.speed + (b.speed - a.speed) * smoothstep((t - a.t) / Math.max(1e-6, b.t - a.t));
    }
  }
  return keys[keys.length - 1].speed;
}

/**
 * A continuous biped **locomotion controller** driven by a speed timeline —
 * the velocity-continuous alternative to cross-fading separate walk/run clips.
 *
 * Why a controller instead of `sequence(walk, run)`: blending two constant-speed
 * clips lerps their planted feet, which sit at different world positions, and the
 * feet slide. Here there is a single, consistent gait whose **cadence, stride,
 * duty, lift, stand height, lean and arm swing all scale with the current speed**,
 * and each foot is **locked** to the world the instant it plants — so accelerating
 * from a stand through a walk into a run never slips a foot.
 *
 * Mass shows up two ways:
 *   • the body velocity lags the target speed (smooth acceleration), and
 *   • the torso is a damped spring in the body's frame, so when the body
 *     decelerates the upper body **overshoots forward and rocks back** while the
 *     planted feet stay put (the legs lean under it — a weight shift).
 *
 * Pure function of `t`: it re-integrates from 0 with a fixed step each call, so
 * scrubbing the timeline is fully deterministic (no stored velocity).
 *
 * ```ts
 * bindPose(hero, clock, locomotion(hero, {
 *   groundY: 320, startX: -500,
 *   speed: [
 *     {t: 0, speed: 0}, {t: 0.8, speed: 0},   // idle
 *     {t: 1.7, speed: 130}, {t: 3, speed: 130}, // ramp up, walk
 *     {t: 3.8, speed: 260}, {t: 5, speed: 260}, // ramp up, run
 *     {t: 5.7, speed: 0},                       // brake → overshoot → settle
 *   ],
 * }));
 * ```
 */
export function locomotion(rig: Rig, opts: LocomotionOptions): PoseFn {
  const off = (r: string) => rig.restOffset(r);
  const reach = rig.boneLength('leftHip', 'leftKnee') + rig.boneLength('leftKnee', 'leftAnkle');
  const startX = opts.startX ?? 0;
  const groundY = opts.groundY ?? 0;
  const bendBias = opts.bendBias ?? 16;
  const keys = opts.speed;
  const runSpeed = opts.runSpeed ?? 260;
  const ks = opts.stiffness ?? 32;
  const kd = opts.damping ?? 5;
  const leanGain = opts.leanGain ?? 0.6;
  const STRIDE = reach * 1.4; // world distance per full gait cycle (wide → legs extend)
  // How far ahead of the hip a foot plants, as a fraction of a stride. Scales with
  // speed so feet plant UNDER the hips at idle (no forward slide when starting) and
  // reach further ahead only as the gait quickens.
  const plantLead = (sp: number) => STRIDE * (0.04 + 0.24 * Math.min(1, sp / runSpeed));
  const kv = 9; // body-velocity responsiveness (acceleration smoothing)
  const hasToes = !!rig.joints.leftToe && !!rig.joints.rightToe;
  const LEGS = [['left', 0], ['right', 0.5]] as const;

  return tQuery => {
    const steps = Math.max(0, Math.round(tQuery / DT));
    let v = 0;
    let bodyX = startX;
    let phi = 0; // gait cycles accumulated
    let dev = 0; // torso x deviation from support (inertia)
    let devV = 0;
    const lastK: Record<string, number> = {left: -1, right: -1};
    const plantX: Record<string, number> = {left: startX, right: startX};
    for (let i = 0; i < steps; i++) {
      const tv = targetSpeedAt(keys, i * DT);
      const prevV = v;
      v += (tv - v) * Math.min(1, DT * kv);
      bodyX += v * DT;
      const bodyA = (v - prevV) / DT;
      phi += (v / STRIDE) * DT;
      // Torso inertia in the support frame: settles to 0 at constant speed,
      // kicked by acceleration → overshoots forward when the body brakes.
      const devA = -ks * dev - kd * devV - bodyA;
      devV += devA * DT;
      dev += devV * DT;
      for (const [leg, lp] of LEGS) {
        const k = Math.floor(phi + lp);
        if (k > lastK[leg]) {
          lastK[leg] = k;
          plantX[leg] = bodyX + off(`${leg}Hip`).x + plantLead(v); // plant ahead of the hip
        }
      }
    }

    // Speed-shaped gait parameters (walk ⇄ run).
    const s = Math.min(1, v / runSpeed);
    const duty = 0.6 - 0.18 * s; // ≥0.5 walk → ~0.42 run
    const lift = reach * (0.08 + 0.08 * s);
    const stand = reach * (0.97 - 0.05 * s); // tall stance → legs read straight, not crouched
    const bobAmp = 2 + 5 * s;
    const liftScale = smoothstep(Math.min(1, v / 60)); // feet hug the ground near a stop

    const rootX = bodyX + dev;
    const lean = Math.max(-18, Math.min(18, -dev * leanGain));
    const bobY = bobAmp * Math.cos(2 * Math.PI * (2 * phi - 0.5));
    const root = new Vector2(rootX, groundY - stand - bobY);
    const m: Pose = {[rig.template.root]: root};

    const sway = lean + 3 * s * Math.sin(2 * Math.PI * phi);
    for (const r of ['neck', 'headCenter', 'leftShoulder', 'rightShoulder'])
      if (rig.joints[r]) m[r] = root.add(rotateDeg(off(r), sway));
    for (const r of ['leftHip', 'rightHip']) if (rig.joints[r]) m[r] = root.add(off(r));

    // Arms counter-swing the legs. As speed rises the elbows tuck and bend so the
    // forearms pump (a runner's bent-arm carriage) instead of swinging straight.
    const armAmp = 10 + 26 * s;
    const swing = armAmp * Math.cos(2 * Math.PI * phi);
    const elbowFlex = -(12 + 52 * s); // forearm bend relative to the upper arm
    const foreSwing = 0.6 * (10 + 14 * s) * Math.cos(2 * Math.PI * phi + 0.5); // forearm pump, lagged
    for (const [side, a, fs] of [['left', -swing, -foreSwing], ['right', swing, foreSwing]] as const) {
      if (!rig.joints[`${side}Shoulder`]) continue;
      const sh = m[`${side}Shoulder`];
      const el = sh.add(rotateDeg(off(`${side}Elbow`).sub(off(`${side}Shoulder`)), a));
      m[`${side}Elbow`] = el;
      if (rig.joints[`${side}Wrist`])
        m[`${side}Wrist`] = el.add(rotateDeg(off(`${side}Wrist`).sub(off(`${side}Elbow`)), a + elbowFlex + fs));
    }

    for (const [leg, lp] of LEGS) {
      const frac = phi + lp - Math.floor(phi + lp);
      // Where this foot would plant if it landed NOW (ahead of the current hip).
      // Easing the swing toward this fresh target — rather than a stale
      // plant+STRIDE — keeps the feet under the body while it accelerates.
      const aheadX = bodyX + off(`${leg}Hip`).x + plantLead(v);
      let footX: number;
      let footY: number;
      if (frac < duty) {
        footX = plantX[leg]; // stance: pinned to the world (no slip)
        footY = groundY;
      } else {
        const sw = (frac - duty) / (1 - duty);
        footX = plantX[leg] + (aheadX - plantX[leg]) * smoothstep(sw);
        footY = groundY - lift * liftScale * Math.sin(Math.PI * sw);
      }
      const [, knee, ankle] = solveLimb(
        rig, [`${leg}Hip`, `${leg}Knee`, `${leg}Ankle`], m[`${leg}Hip`], new Vector2(footX, footY), bendBias,
      );
      m[`${leg}Knee`] = knee;
      m[`${leg}Ankle`] = ankle;
      if (hasToes) {
        const footLen = rig.boneLength(`${leg}Ankle`, `${leg}Toe`);
        const sw = frac < duty ? 0 : (frac - duty) / (1 - duty);
        const footAngle = frac < duty ? 0 : (18 - 30 * sw) * liftScale;
        m[`${leg}Toe`] = ankle.add(rotateDeg(new Vector2(footLen, 0), footAngle));
      }
    }
    return m;
  };
}
