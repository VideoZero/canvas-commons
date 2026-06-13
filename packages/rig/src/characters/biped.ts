import {Vector2} from '@motion-canvas/core';
import type {Rig} from '../skeleton';
import {rotateDeg, smoothstep} from '../util/vec';
import type {Pose, PoseFn} from './bind';
import type {PoseLayer} from './compose';
import {wave as waveArm, type WaveOptions} from './gestures';
import {plantedFoot, solveLimb, walkBody} from './walk';

/** Place every joint rigidly at `root` + its rest offset (the neutral pose). */
function rigidPose(rig: Rig, root: Vector2): Pose {
  const m: Pose = {[rig.template.root]: root};
  for (const r of Object.keys(rig.joints)) m[r] = root.add(rig.restOffset(r));
  return m;
}

export interface BipedWalkOptions {
  startX?: number;
  groundY?: number;
  /** Forward speed (px·s⁻¹). Defaults to ≈0.85 × leg reach per stride. */
  speed?: number;
  period?: number;
  /** Hip height above ground. Default ≈0.94 × leg reach (tall, slight knee bend). */
  stand?: number;
  /** Peak swing-foot clearance. Default ≈0.23 × leg reach. */
  lift?: number;
  bob?: number;
  /** Upper-body side-sway in degrees (default 3.5). */
  sway?: number;
  /** Constant forward torso lean in degrees (default 0; a run leans more). */
  lean?: number;
  /** Arm counter-swing amplitude in degrees (default 18). */
  armSwing?: number;
  /** Stance duty factor (default 0.5 — a biped walk; a run sits lower, ≈0.35). */
  duty?: number;
  bendBias?: number;
  /** Toe angle (deg) at toe-off, the start of swing (default 18). */
  toeLift?: number;
  /** Toe angle (deg) at heel-strike, the end of swing (default -12). */
  toeStrike?: number;
}

export interface BipedIdleOptions {
  /** Where the root stands, in world space. Or give `groundY` (+ optional `x`). */
  at?: Vector2;
  groundY?: number;
  x?: number;
  /** Vertical breathing amplitude (default 4). */
  breathe?: number;
  period?: number;
}

export interface BipedWaveOptions extends Omit<WaveOptions, 'shoulder' | 'elbow' | 'wrist'> {
  /** Which arm waves (default 'right'). */
  arm?: 'left' | 'right';
}

export interface BipedJumpOptions {
  /** Where the root stands at rest, in world space. Or give `groundY` (+ optional `x`). */
  at?: Vector2;
  groundY?: number;
  x?: number;
  /** Total clip length in seconds (default 1.1). After it, the rig holds the landed pose. */
  period?: number;
  /** Peak rise of the root above its stand height (default ≈0.55 × leg reach). */
  height?: number;
  /** How deep the crouch dips before launch (default ≈0.18 × leg reach). */
  crouch?: number;
  bendBias?: number;
}

/** Resolved numeric parameters shared by `walk` and `run`. */
interface GaitParams {
  startX: number;
  groundY: number;
  period: number;
  stand: number;
  speed: number;
  stride: number;
  lift: number;
  bob: number;
  sway: number;
  lean: number;
  armSwing: number;
  duty: number;
  bendBias: number;
  toeLift: number;
  toeStrike: number;
}

/** The shared biped locomotion cycle — `walk` and `run` differ only in defaults. */
function gaitCycle(rig: Rig, p: GaitParams): PoseFn {
  const off = (r: string) => rig.restOffset(r);
  const hasToes = !!rig.joints.leftToe && !!rig.joints.rightToe;
  const {startX, groundY, period, stand, speed, stride, lift, bob, duty, bendBias} = p;
  return t => {
    const root = walkBody(t, {startX, speed, groundY, stand, period, bob});
    const m: Pose = {[rig.template.root]: root};
    const swayDeg = p.sway * Math.sin((2 * Math.PI * t) / period) + p.lean;
    for (const r of ['neck', 'headCenter', 'leftShoulder', 'rightShoulder']) {
      if (rig.joints[r]) m[r] = root.add(rotateDeg(off(r), swayDeg));
    }
    for (const r of ['leftHip', 'rightHip']) if (rig.joints[r]) m[r] = root.add(off(r));
    // Arms counter-swing the legs (cosine-phased so each arm syncs its opposite leg).
    const swing = p.armSwing * Math.cos((2 * Math.PI * t) / period);
    for (const [s, a] of [['left', -swing], ['right', swing]] as const) {
      if (!rig.joints[`${s}Shoulder`]) continue;
      const sh = m[`${s}Shoulder`];
      const el = sh.add(rotateDeg(off(`${s}Elbow`).sub(off(`${s}Shoulder`)), a));
      m[`${s}Elbow`] = el;
      if (rig.joints[`${s}Wrist`]) {
        m[`${s}Wrist`] = el.add(rotateDeg(off(`${s}Wrist`).sub(off(`${s}Elbow`)), a - 12));
      }
    }
    // Legs: FABRIK to world-fixed foot targets; flat foot rolls through swing.
    for (const [s, phase] of [['left', 0], ['right', 0.5]] as const) {
      const tgt = plantedFoot(t, {
        startX, groundY, stride, period, lift, hipOffsetX: off(`${s}Hip`).x, phase, duty,
      });
      const [, knee, ankle] = solveLimb(
        rig, [`${s}Hip`, `${s}Knee`, `${s}Ankle`], m[`${s}Hip`], tgt, bendBias,
      );
      m[`${s}Knee`] = knee;
      m[`${s}Ankle`] = ankle;
      if (hasToes) {
        const footLen = rig.boneLength(`${s}Ankle`, `${s}Toe`);
        const fp = t / period + phase;
        const fFrac = fp - Math.floor(fp);
        const swg = fFrac < duty ? 0 : (fFrac - duty) / (1 - duty);
        const footAngle = fFrac < duty ? 0 : p.toeLift + (p.toeStrike - p.toeLift) * swg;
        m[`${s}Toe`] = ankle.add(rotateDeg(new Vector2(footLen, 0), footAngle));
      }
    }
    return m;
  };
}

/**
 * Animation library for the {@link BIPED} skeleton. Each function returns a pose
 * (or, for gestures, an overlay layer) you drive with {@link bindPose} /
 * {@link compose}. They read the rig's own bone lengths, so the same call
 * retargets across characters of different proportions.
 */
export const biped = {
  /** A planted-feet walk cycle: sway, counter-swinging arms, IK legs, foot roll. */
  walk(rig: Rig, opts: BipedWalkOptions = {}): PoseFn {
    const reach =
      rig.boneLength('leftHip', 'leftKnee') + rig.boneLength('leftKnee', 'leftAnkle');
    const period = opts.period ?? 1.2;
    return gaitCycle(rig, {
      startX: opts.startX ?? 0,
      groundY: opts.groundY ?? 0,
      period,
      stand: opts.stand ?? reach * 0.94,
      speed: opts.speed ?? (reach * 0.85) / period,
      stride: (opts.speed ?? (reach * 0.85) / period) * period,
      lift: opts.lift ?? reach * 0.23,
      bob: opts.bob ?? 3,
      sway: opts.sway ?? 3.5,
      lean: opts.lean ?? 0,
      armSwing: opts.armSwing ?? 18,
      duty: opts.duty ?? 0.5,
      bendBias: opts.bendBias ?? 16,
      toeLift: opts.toeLift ?? 18,
      toeStrike: opts.toeStrike ?? -12,
    });
  },

  /**
   * A run: lower duty (a flight phase where neither foot touches), longer stride,
   * higher knee lift, a forward lean and bigger arm drive. Same cycle as
   * {@link walk}, just hotter defaults — override any of them.
   */
  run(rig: Rig, opts: BipedWalkOptions = {}): PoseFn {
    const reach =
      rig.boneLength('leftHip', 'leftKnee') + rig.boneLength('leftKnee', 'leftAnkle');
    const period = opts.period ?? 0.7;
    return gaitCycle(rig, {
      startX: opts.startX ?? 0,
      groundY: opts.groundY ?? 0,
      period,
      stand: opts.stand ?? reach * 0.86,
      speed: opts.speed ?? (reach * 1.7) / period,
      stride: (opts.speed ?? (reach * 1.7) / period) * period,
      lift: opts.lift ?? reach * 0.34,
      bob: opts.bob ?? 6,
      sway: opts.sway ?? 2.5,
      lean: opts.lean ?? 12,
      armSwing: opts.armSwing ?? 34,
      duty: opts.duty ?? 0.35,
      bendBias: opts.bendBias ?? 18,
      toeLift: opts.toeLift ?? 26,
      toeStrike: opts.toeStrike ?? -18,
    });
  },

  /** Stand still and breathe — a gentle vertical bob, all joints at rest. */
  idle(rig: Rig, opts: BipedIdleOptions = {}): PoseFn {
    const breathe = opts.breathe ?? 4;
    const period = opts.period ?? 1.2;
    const at =
      opts.at ?? new Vector2(opts.x ?? 0, (opts.groundY ?? 0) - rig.restOffset('leftAnkle').y);
    return t => rigidPose(rig, at.add(new Vector2(0, Math.sin((Math.PI * t) / period) * breathe)));
  },

  /**
   * A single in-place jump with weight: **anticipate** (a deep crouch + arms swung
   * back to wind up) → **launch** (extend, throw the arms overhead) → **airborne**
   * (root rises by `height`, knees keep a natural slight bend, never locked) →
   * **land** (feet plant, knees fold to absorb) → **recover** (settle to stand).
   *
   * The legs hold a constant slightly-bent length through the flight (feet rise
   * WITH the body), so the knees are never 100% straight; they only fold further
   * once the feet are back on the ground and the body keeps sinking. Pure in `t`;
   * after `period` it holds the settled stand pose.
   */
  jump(rig: Rig, opts: BipedJumpOptions = {}): PoseFn {
    const reach =
      rig.boneLength('leftHip', 'leftKnee') + rig.boneLength('leftKnee', 'leftAnkle');
    const off = (r: string) => rig.restOffset(r);
    const period = opts.period ?? 1.1;
    const stand = reach * 0.82; // a touch crouched at rest → slack for bent knees
    const height = opts.height ?? reach * 0.62;
    const crouchDepth = opts.crouch ?? reach * 0.32; // deep anticipation/absorb
    const bendBias = opts.bendBias ?? 16;
    const groundY = opts.groundY ?? (opts.at ? opts.at.y + stand : 0);
    const baseX = opts.at?.x ?? opts.x ?? 0;
    const hasToes = !!rig.joints.leftToe && !!rig.joints.rightToe;

    // Root rise above stand across the clip [0,1]: <0 sinks (crouch/absorb), >0 airborne.
    const riseAt = (f: number): number => {
      if (f >= 1) return 0;
      if (f < 0.3) return -crouchDepth * smoothstep(f / 0.3); // deep anticipation crouch
      if (f < 0.4) return -crouchDepth * (1 - smoothstep((f - 0.3) / 0.1)); // explosive extension to 0
      if (f < 0.72) return height * Math.sin(Math.PI * ((f - 0.4) / 0.32)); // airborne arc
      if (f < 0.85) return -crouchDepth * 0.85 * smoothstep((f - 0.72) / 0.13); // land & absorb
      return -crouchDepth * 0.85 * (1 - smoothstep((f - 0.85) / 0.15)); // recover to stand
    };

    // Arm angle (deg about the shoulder): wind back → throw overhead → bring down.
    const armAt = (f: number): number => {
      if (f < 0.3) return -10 + 45 * smoothstep(f / 0.3); // wind up: swing back/down
      if (f < 0.56) return 35 - 205 * smoothstep((f - 0.3) / 0.26); // throw to overhead (≈ -170)
      if (f < 0.72) return -170; // hold overhead at apex
      if (f < 0.88) return -170 + 160 * smoothstep((f - 0.72) / 0.16); // bring down on landing
      return -10;
    };

    // Torso pitch (deg, + = fold forward): load forward → extend up on launch →
    // ease forward to land → fold to absorb → settle. Keeps the body from reading
    // as one rigid block.
    const leanAt = (f: number): number => {
      if (f < 0.3) return 16 * smoothstep(f / 0.3); // load forward
      if (f < 0.4) return 16 - 24 * smoothstep((f - 0.3) / 0.1); // snap up/back through extension
      if (f < 0.72) return -8 + 12 * smoothstep((f - 0.4) / 0.32); // float, tuck for landing
      if (f < 0.85) return 4 + 12 * smoothstep((f - 0.72) / 0.13); // fold to absorb
      return 16 * (1 - smoothstep((f - 0.85) / 0.15)); // recover
    };

    // Squash & stretch — vertical scale of the torso: compress on the crouch and the
    // landing, stretch through the launch. (Bone rigs stretch cleanly.)
    const stretchAt = (f: number): number => {
      if (f < 0.3) return 1 - 0.12 * smoothstep(f / 0.3); // squash (load)
      if (f < 0.45) return 0.88 + 0.26 * smoothstep((f - 0.3) / 0.15); // stretch (launch)
      if (f < 0.72) return 1.14 - 0.14 * smoothstep((f - 0.45) / 0.27); // settle in the air
      if (f < 0.82) return 1 - 0.16 * smoothstep((f - 0.72) / 0.1); // squash (absorb)
      return 0.84 + 0.16 * smoothstep((f - 0.82) / 0.18); // recover
    };

    return t => {
      const f = Math.min(t / period, 1);
      const rise = riseAt(f); // screen y DECREASES upward, so subtract
      const lean = leanAt(f);
      const stretch = stretchAt(f);
      const root = new Vector2(baseX, groundY - stand - rise);
      const m: Pose = {[rig.template.root]: root};
      for (const r of ['leftHip', 'rightHip']) if (rig.joints[r]) m[r] = root.add(off(r));
      // Upper body: vertical squash/stretch, then pitch about the root.
      const upper = (r: string) =>
        root.add(rotateDeg(new Vector2(off(r).x, off(r).y * stretch), lean));
      for (const r of ['neck', 'leftShoulder', 'rightShoulder']) if (rig.joints[r]) m[r] = upper(r);
      if (rig.joints.headCenter && rig.joints.neck) {
        // Head trails the torso a touch more (overlap / follow-through).
        const hd = new Vector2(off('headCenter').x - off('neck').x, (off('headCenter').y - off('neck').y) * stretch);
        m.headCenter = m.neck.add(rotateDeg(hd, lean * 1.35));
      }

      const armRaise = armAt(f);
      const foreRaise = armAt(Math.max(0, f - 0.05)) + 14; // forearm trails + slight elbow bend
      for (const s of ['left', 'right'] as const) {
        if (!rig.joints[`${s}Shoulder`]) continue;
        const sh = m[`${s}Shoulder`];
        const el = sh.add(rotateDeg(off(`${s}Elbow`).sub(off(`${s}Shoulder`)), armRaise));
        m[`${s}Elbow`] = el;
        if (rig.joints[`${s}Wrist`])
          m[`${s}Wrist`] = el.add(rotateDeg(off(`${s}Wrist`).sub(off(`${s}Elbow`)), foreRaise));
      }

      for (const s of ['left', 'right'] as const) {
        // Airborne (rise > 0): feet rise WITH the body, so the leg keeps a constant
        // slightly-bent length and never locks straight. Grounded (rise ≤ 0): feet
        // stay on the floor, so as the body sinks the knees fold to absorb.
        const footY = rise > 0 ? groundY - rise : groundY;
        const [, knee, ankle] = solveLimb(
          rig, [`${s}Hip`, `${s}Knee`, `${s}Ankle`], m[`${s}Hip`],
          new Vector2(baseX + off(`${s}Hip`).x, footY), bendBias,
        );
        m[`${s}Knee`] = knee;
        m[`${s}Ankle`] = ankle;
        if (hasToes) {
          const footLen = rig.boneLength(`${s}Ankle`, `${s}Toe`);
          const toeAngle = rise > 0 ? 32 : 0; // point toes in the air, flat on the ground
          m[`${s}Toe`] = ankle.add(rotateDeg(new Vector2(footLen, 0), toeAngle));
        }
      }
      return m;
    };
  },

  /** Overlay: raise an arm and wave the hand (see {@link wave}). */
  wave(rig: Rig, opts: BipedWaveOptions = {}): PoseLayer {
    const a = opts.arm ?? 'right';
    const roles =
      a === 'right'
        ? {shoulder: 'rightShoulder', elbow: 'rightElbow', wrist: 'rightWrist'}
        : {shoulder: 'leftShoulder', elbow: 'leftElbow', wrist: 'leftWrist'};
    return (t, pose) =>
      waveArm(rig, pose, t, {
        ...roles,
        raise: opts.raise,
        bend: opts.bend,
        amplitude: opts.amplitude,
        frequency: opts.frequency,
      });
  },
};
