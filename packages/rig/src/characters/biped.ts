import {Vector2} from '@motion-canvas/core';
import type {Rig} from '../skeleton';
import {rotateDeg} from '../util/vec';
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
  /** Arm counter-swing amplitude in degrees (default 18). */
  armSwing?: number;
  /** Stance duty factor (default 0.5 — a biped walk). */
  duty?: number;
  bendBias?: number;
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

/**
 * Animation library for the {@link BIPED} skeleton. Each function returns a pose
 * (or, for gestures, an overlay layer) you drive with {@link bindPose} /
 * {@link compose}. They read the rig's own bone lengths, so the same call
 * retargets across characters of different proportions.
 */
export const biped = {
  /** A planted-feet walk cycle: sway, counter-swinging arms, IK legs, foot roll. */
  walk(rig: Rig, opts: BipedWalkOptions = {}): PoseFn {
    const off = (r: string) => rig.restOffset(r);
    const reach =
      rig.boneLength('leftHip', 'leftKnee') + rig.boneLength('leftKnee', 'leftAnkle');
    const startX = opts.startX ?? 0;
    const groundY = opts.groundY ?? 0;
    const period = opts.period ?? 1.2;
    const stand = opts.stand ?? reach * 0.94;
    const speed = opts.speed ?? (reach * 0.85) / period;
    const stride = speed * period;
    const lift = opts.lift ?? reach * 0.23;
    const bob = opts.bob ?? 3;
    const sway = opts.sway ?? 3.5;
    const armSwing = opts.armSwing ?? 18;
    const duty = opts.duty ?? 0.5;
    const bendBias = opts.bendBias ?? 16;
    const hasToes = !!rig.joints.leftToe && !!rig.joints.rightToe;

    return t => {
      const root = walkBody(t, {startX, speed, groundY, stand, period, bob});
      const m: Pose = {[rig.template.root]: root};
      const swayDeg = sway * Math.sin((2 * Math.PI * t) / period);
      for (const r of ['neck', 'headCenter', 'leftShoulder', 'rightShoulder']) {
        if (rig.joints[r]) m[r] = root.add(rotateDeg(off(r), swayDeg));
      }
      for (const r of ['leftHip', 'rightHip']) if (rig.joints[r]) m[r] = root.add(off(r));
      // Arms counter-swing the legs (cosine-phased so each arm syncs its opposite leg).
      const swing = armSwing * Math.cos((2 * Math.PI * t) / period);
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
          const footAngle = fFrac < duty ? 0 : 18 - 30 * swg;
          m[`${s}Toe`] = ankle.add(rotateDeg(new Vector2(footLen, 0), footAngle));
        }
      }
      return m;
    };
  },

  /** Stand still and breathe — a gentle vertical bob, all joints at rest. */
  idle(rig: Rig, opts: BipedIdleOptions = {}): PoseFn {
    const breathe = opts.breathe ?? 4;
    const period = opts.period ?? 1.2;
    const at =
      opts.at ?? new Vector2(opts.x ?? 0, (opts.groundY ?? 0) - rig.restOffset('leftAnkle').y);
    return t => rigidPose(rig, at.add(new Vector2(0, Math.sin((Math.PI * t) / period) * breathe)));
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
