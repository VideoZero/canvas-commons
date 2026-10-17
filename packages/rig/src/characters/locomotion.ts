import {Vector2} from '@canvas-commons/core';
import type {Rig} from '../skeleton';
import {rotateDeg, smoothstep} from '../util/vec';
import type {Pose, PoseFn} from './bind';
import {plantedFootAt, solveLimb} from './walk';

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
  if (keys.length === 0) return 0;
  if (t <= keys[0].t) return keys[0].speed;
  for (let i = 1; i < keys.length; i++) {
    if (t <= keys[i].t) {
      const a = keys[i - 1];
      const b = keys[i];
      return (
        a.speed +
        (b.speed - a.speed) * smoothstep((t - a.t) / Math.max(1e-6, b.t - a.t))
      );
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
 * @example
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
  const reach =
    rig.boneLength('leftHip', 'leftKnee') +
    rig.boneLength('leftKnee', 'leftAnkle');
  const startX = opts.startX ?? 0;
  const groundY = opts.groundY ?? 0;
  const bendBias = opts.bendBias ?? 16;
  const keys = opts.speed;
  const runSpeed = opts.runSpeed ?? 260;
  const ks = opts.stiffness ?? 32;
  const kd = opts.damping ?? 5;
  const leanGain = opts.leanGain ?? 0.6;
  const stride = reach * 0.95;
  // Constant stance centering: varying it would make planted feet slip.
  const plantLead = 0.3;
  const kv = 9; // body-velocity responsiveness (acceleration smoothing)
  const hasToes = !!rig.joints.leftToe && !!rig.joints.rightToe;
  const legs = [
    ['right', 0],
    ['left', 0.5],
  ] as const;

  return tQuery => {
    const steps = Math.max(0, Math.round(tQuery / DT));
    let v = 0;
    let bodyX = startX;
    let phi = 0; // gait cycles accumulated
    let dev = 0; // torso x deviation from support (inertia)
    let devV = 0;
    let accel = 0; // current body acceleration (px·s⁻²)
    for (let i = 0; i < steps; i++) {
      const tv = targetSpeedAt(keys, i * DT);
      const prevV = v;
      v += (tv - v) * Math.min(1, DT * kv);
      bodyX += v * DT;
      accel = (v - prevV) / DT;
      phi += (v / stride) * DT;
      // Torso inertia in the support frame: settles to 0 at constant speed,
      // kicked by acceleration → overshoots forward when the body brakes.
      const devA = -ks * dev - kd * devV - accel;
      devV += devA * DT;
      dev += devV * DT;
    }

    // Speed-shaped gait parameters (walk ⇄ run).
    const s = Math.min(1, v / runSpeed);
    const duty = 0.6 - 0.18 * s; // ≥0.5 walk → ~0.42 run
    const lift = reach * (0.12 + 0.06 * s);
    // Only collapse the swing arc once almost fully stopped, so a foot frozen
    // mid-stride lowers to the ground — a moving walk always lifts (no drag).
    const liftScale = smoothstep(Math.min(1, v / 30));

    // Settle weight: 1 at a standstill → 0 once walking. Near a stop the feet
    // gather to a neutral, feet-together stance (and splay out again on the first
    // step), done as lifted STEPS rather than a ground slide.
    const rest = 1 - smoothstep(Math.min(1, v / 35));

    // Hip height: a mean stand plus a vault that lifts the body up over the
    // supporting leg at each mid-stance (so the stance leg straightens into an
    // extended stride), and dips at contact. Both fade out as the body comes to
    // rest, where the figure simply stands tall and still — no phantom gait wobble.
    const standMean = reach * (0.9 - 0.04 * s) + reach * 0.06 * rest;
    const vault =
      reach * 0.06 * Math.cos(4 * Math.PI * (phi - plantLead)) * (1 - rest);

    // ── Foot targets ─────────────────────────────────────────────────────────
    // During the walk each foot is locked to the world lattice (no slip). As the
    // body settles to a stop the feet GATHER to a neutral, feet-together stance —
    // but ONE foot at a time: each foot owns half of the `rest` ramp, and each is
    // lifted in an arc as it travels so it steps into place. A believable weight
    // shift, not a two-foot hop or a slide. At walking speed `rest` is 0, so every
    // foot just tracks the lattice and none of this runs.
    const stepOrder: Record<string, number> = {right: 1, left: 0};
    const footPos: Record<string, Vector2> = {};
    const footStep: Record<string, number> = {}; // 0 planted … 1 mid-step (foot in the air)
    const footTravel: Record<string, number> = {}; // how far this foot actually moves this step
    for (const [leg, lp] of legs) {
      const tgt = plantedFootAt(phi + lp, {
        startX,
        groundY,
        stride,
        lift: lift * liftScale,
        hipOffsetX: off(`${leg}Hip`).x,
        phase: lp,
        duty,
        plantLead,
      });
      const neutralX = bodyX + off(`${leg}Hip`).x;
      // A foot NEVER steps backward to begin a walk: don't let it travel behind the
      // spot it is standing on (its idle world position). It just stays planted
      // there and becomes the trailing leg as the body walks forward over it. Once
      // the body has moved on, the lattice is well ahead and this never bites.
      const idleSpotX = startX + off(`${leg}Hip`).x;
      const tgtX = Math.max(tgt.x, idleSpotX);
      const win = stepOrder[leg] ?? 0; // 0 → first half of the settle, 1 → second half
      const move = smoothstep(
        Math.min(1, Math.max(0, (rest - win * 0.5) / 0.5)),
      );
      const step = Math.sin(Math.PI * move); // lift arc: 0 at both ends, 1 mid-step
      footStep[leg] = step;
      // Lift scales with how far the foot actually travels, so a foot that just
      // stays put (the trailing support) doesn't bob in place.
      const travel = Math.abs(tgtX - neutralX);
      footTravel[leg] = travel;
      footPos[leg] = new Vector2(
        tgtX + (neutralX - tgtX) * move,
        tgt.y + (groundY - tgt.y) * move - step * 0.6 * travel,
      );
    }

    // The center of mass shifts OVER the planted foot while the other foot is in
    // the air — you can't lift a foot without first putting your weight on the
    // support leg. (Only one foot steps at a time, so at most one term is active.)
    // Gate the shift by how far the swinging foot ACTUALLY travels: a trailing
    // support foot that stays pinned in place isn't really "in the air", so its
    // phantom lift must not dump the whole COM forward onto the lead foot (that
    // read as a lurch/wobble when starting to walk).
    let comShiftX = 0;
    for (const [leg] of legs) {
      const other = leg === 'left' ? 'right' : 'left';
      if (!footPos[other]) continue;
      const airborne =
        footStep[leg] *
        smoothstep(Math.min(1, footTravel[leg] / (reach * 0.15)));
      comShiftX += airborne * 0.8 * (footPos[other].x - bodyX);
    }

    // Active forward drive: to START (or speed up) a walk you tip your center of
    // mass forward — begin to fall — and THEN swing a leg out to catch it. So the
    // COM leads forward proportional to forward acceleration (plus a steady lean
    // that grows with speed). The planted feet stay put (FABRIK solves the legs to
    // them), so leading the COM forward tilts the whole body into the step instead
    // of reading as a balance-save. Braking keeps the passive `dev` overshoot.
    const drive = Math.min(1, Math.max(0, accel) / 160); // 0..1 forward-acceleration
    const forwardCom = reach * (0.17 * drive + 0.05 * s);
    const forwardLean = 14 * drive + 7 * s; // torso pitch into the direction of travel (deg)

    const rootX = bodyX + dev + comShiftX + forwardCom;
    const lean = Math.max(-18, Math.min(18, -dev * leanGain)) + forwardLean;
    const root = new Vector2(rootX, groundY - standMean - vault);
    const m: Pose = {[rig.template.root]: root};

    const sway = lean + 3 * s * Math.sin(2 * Math.PI * phi);
    for (const r of ['neck', 'headCenter', 'leftShoulder', 'rightShoulder']) {
      if (rig.joints[r]) m[r] = root.add(rotateDeg(off(r), sway));
    }
    for (const r of ['leftHip', 'rightHip']) {
      if (rig.joints[r]) m[r] = root.add(off(r));
    }

    // Arms counter-swing the legs. As speed rises the elbows tuck and bend so the
    // forearms pump (a runner's bent-arm carriage) instead of swinging straight.
    const armAmp = 10 + 26 * s;
    const swing = armAmp * Math.cos(2 * Math.PI * phi);
    const elbowFlex = -(12 + 52 * s); // forearm bend relative to the upper arm
    const foreSwing = 0.6 * (10 + 14 * s) * Math.cos(2 * Math.PI * phi + 0.5); // forearm pump, lagged
    // Arms counter the legs (opposite arm with each leg). Right leg leads, so the
    // LEFT arm leads to keep the diagonal coordination.
    for (const [side, a, fs] of [
      ['left', swing, foreSwing],
      ['right', -swing, -foreSwing],
    ] as const) {
      if (!rig.joints[`${side}Shoulder`]) continue;
      const sh = m[`${side}Shoulder`];
      const el = sh.add(
        rotateDeg(off(`${side}Elbow`).sub(off(`${side}Shoulder`)), a),
      );
      m[`${side}Elbow`] = el;
      if (rig.joints[`${side}Wrist`]) {
        m[`${side}Wrist`] = el.add(
          rotateDeg(
            off(`${side}Wrist`).sub(off(`${side}Elbow`)),
            a + elbowFlex + fs,
          ),
        );
      }
    }

    for (const [leg, lp] of legs) {
      const [, knee, ankle] = solveLimb(
        rig,
        [`${leg}Hip`, `${leg}Knee`, `${leg}Ankle`],
        m[`${leg}Hip`],
        footPos[leg],
        bendBias,
      );
      m[`${leg}Knee`] = knee;
      m[`${leg}Ankle`] = ankle;
      if (hasToes) {
        const footLen = rig.boneLength(`${leg}Ankle`, `${leg}Toe`);
        const frac = phi + lp - Math.floor(phi + lp);
        const sw = frac < duty ? 0 : (frac - duty) / (1 - duty);
        const walkToe = frac < duty ? 0 : (18 - 30 * sw) * liftScale;
        const footAngle = walkToe + footStep[leg] * 22; // point the toe while stepping in
        m[`${leg}Toe`] = ankle.add(
          rotateDeg(new Vector2(footLen, 0), footAngle),
        );
      }
    }
    return m;
  };
}
