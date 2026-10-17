import {Vector2} from '@canvas-commons/core';
import type {Rig} from '../skeleton';
import {rotateDeg} from '../util/vec';
import type {Pose, PoseFn} from './bind';
import type {PoseLayer} from './compose';
import {plantedFoot, solveLimb, walkBody} from './walk';

const LEGS = [
  {leg: 'backLeft', phase: 0.0, bend: 1},
  {leg: 'frontLeft', phase: 0.25, bend: -1},
  {leg: 'backRight', phase: 0.5, bend: 1},
  {leg: 'frontRight', phase: 0.75, bend: -1},
] as const;

export interface QuadrupedWalkOptions {
  startX?: number;
  groundY?: number;
  speed?: number;
  period?: number;
  /** Body height above ground. Default ≈0.85 × leg reach. */
  stand?: number;
  lift?: number;
  bob?: number;
  /**
   * Stance duty factor (default 0.7). A quadruped walk needs more than 0.5 so at least
   * three feet stay grounded; lower it toward 0.5 for a trot, less for a run.
   */
  duty?: number;
  bendBias?: number;
  /** Head bob amplitude in degrees (default 4); 0 to disable. */
  headBob?: number;
  /** Toe angle (deg) at toe-off, the start of swing (default 22). */
  toeLift?: number;
  /** Toe angle (deg) at touch-down, the end of swing (default -14). */
  toeStrike?: number;
}

export interface WagTailOptions {
  amplitude?: number; // degrees (default 15)
  period?: number;
}

export interface FlickEarsOptions {
  amplitude?: number; // degrees of tip drag (default 18)
  period?: number;
}

export interface QuadrupedIdleOptions {
  at?: Vector2;
  groundY?: number;
  x?: number;
  breathe?: number;
  period?: number;
}

/** Resolved numeric parameters shared by the quadruped `walk` and `run`. */
interface QuadGaitParams {
  startX: number;
  groundY: number;
  period: number;
  stand: number;
  speed: number;
  stride: number;
  lift: number;
  bob: number;
  duty: number;
  bendBias: number;
  headBob: number;
  toeLift: number;
  toeStrike: number;
}

/** The shared quadruped locomotion cycle — `walk` and `run` differ only in defaults. */
function quadGaitCycle(rig: Rig, p: QuadGaitParams): PoseFn {
  const off = (r: string) => rig.restOffset(r);
  const {
    startX,
    groundY,
    period,
    stand,
    speed,
    stride,
    lift,
    bob,
    duty,
    bendBias,
  } = p;
  const root0 = rig.template.root;
  return t => {
    const root = walkBody(t, {startX, speed, groundY, stand, period, bob});
    const m: Pose = {[root0]: root};
    for (const r of Object.keys(rig.joints)) m[r] = root.add(off(r)); // rigid base
    for (const {leg, phase, bend} of LEGS) {
      if (!rig.joints[`${leg}Hip`]) continue;
      const tgt = plantedFoot(t, {
        startX,
        groundY,
        stride,
        period,
        lift,
        hipOffsetX: off(`${leg}Hip`).x,
        phase,
        duty,
      });
      const [, knee, ankle] = solveLimb(
        rig,
        [`${leg}Hip`, `${leg}Knee`, `${leg}Ankle`],
        m[`${leg}Hip`],
        tgt,
        bend * bendBias,
      );
      m[`${leg}Knee`] = knee;
      m[`${leg}Ankle`] = ankle;
      if (rig.joints[`${leg}Toe`]) {
        const footLen = rig.boneLength(`${leg}Ankle`, `${leg}Toe`);
        const fp = t / period + phase;
        const fFrac = fp - Math.floor(fp);
        const swg = fFrac < duty ? 0 : (fFrac - duty) / (1 - duty);
        const footAngle =
          fFrac < duty ? 0 : p.toeLift + (p.toeStrike - p.toeLift) * swg;
        m[`${leg}Toe`] = ankle.add(
          rotateDeg(new Vector2(footLen, 0), footAngle),
        );
      }
    }
    if (p.headBob && rig.joints.neck && rig.joints.headCenter) {
      const hb = Math.sin((2 * Math.PI * t) / period) * p.headBob;
      m.headCenter = m.neck.add(
        rotateDeg(off('headCenter').sub(off('neck')), hb),
      );
    }
    return m;
  };
}

/**
 * Animation library for the {@link QUADRUPED} skeleton. As with {@link biped},
 * these read the rig's own bone lengths, so they retarget across animals. *
 * @example
 * ```ts
 * bindPose(dog, clock, compose(quadruped.walk(dog), quadruped.wagTail(dog)));
 * ```
 */
export const quadruped = {
  /**
   * A four-beat lateral-sequence walk: legs solved with FABRIK to world-fixed,
   * flat-footed targets (no slide), a gentle body bob, and an optional head bob.
   * Pair with {@link wagTail} / {@link flickEars} via {@link compose}.
   */
  walk(rig: Rig, opts: QuadrupedWalkOptions = {}): PoseFn {
    const reach =
      rig.boneLength('frontLeftHip', 'frontLeftKnee') +
      rig.boneLength('frontLeftKnee', 'frontLeftAnkle');
    const period = opts.period ?? 1.2;
    const speed = opts.speed ?? (reach * 0.9) / period;
    return quadGaitCycle(rig, {
      startX: opts.startX ?? 0,
      groundY: opts.groundY ?? 0,
      period,
      stand: opts.stand ?? reach * 0.85,
      speed,
      stride: speed * period,
      lift: opts.lift ?? reach * 0.14,
      bob: opts.bob ?? 1.5,
      duty: opts.duty ?? 0.7,
      bendBias: opts.bendBias ?? 16,
      headBob: opts.headBob ?? 4,
      toeLift: opts.toeLift ?? 22,
      toeStrike: opts.toeStrike ?? -14,
    });
  },

  /**
   * A run: lower duty (a suspension phase), longer stride, higher lift and more
   * body bounce. Same four-beat cycle as {@link walk} with hotter defaults — for
   * a true bounding gallop, phase-group the legs and lower `duty` further.
   */
  run(rig: Rig, opts: QuadrupedWalkOptions = {}): PoseFn {
    const reach =
      rig.boneLength('frontLeftHip', 'frontLeftKnee') +
      rig.boneLength('frontLeftKnee', 'frontLeftAnkle');
    const period = opts.period ?? 0.6;
    const speed = opts.speed ?? (reach * 2.0) / period;
    return quadGaitCycle(rig, {
      startX: opts.startX ?? 0,
      groundY: opts.groundY ?? 0,
      period,
      stand: opts.stand ?? reach * 0.82,
      speed,
      stride: speed * period,
      lift: opts.lift ?? reach * 0.26,
      bob: opts.bob ?? 4,
      duty: opts.duty ?? 0.45,
      bendBias: opts.bendBias ?? 18,
      headBob: opts.headBob ?? 7,
      toeLift: opts.toeLift ?? 28,
      toeStrike: opts.toeStrike ?? -18,
    });
  },

  /** Overlay: wag the tail about the root. */
  wagTail(rig: Rig, opts: WagTailOptions = {}): PoseLayer {
    const amp = opts.amplitude ?? 15;
    const period = opts.period ?? 1.2;
    return (t, pose) => {
      if (!rig.joints.tail) return;
      const ph = (2 * Math.PI * t) / period;
      pose.tail = pose[rig.template.root].add(
        rotateDeg(rig.restOffset('tail'), Math.sin(ph * 2) * amp),
      );
    };
  },

  /** Overlay: floppy ears that stay attached to the (bobbing) head and trail with inertia. */
  flickEars(rig: Rig, opts: FlickEarsOptions = {}): PoseLayer {
    const amp = opts.amplitude ?? 18;
    const period = opts.period ?? 1.2;
    return (t, pose) => {
      if (!rig.joints.neck) return;
      const off = (r: string) => rig.restOffset(r);
      const ph = (2 * Math.PI * t) / period;
      const headBob = Math.sin(ph) * 4;
      for (const [ear, lag] of [
        ['left', 0],
        ['right', 0.4],
      ] as const) {
        if (!rig.joints[`${ear}EarBase`]) continue;
        const base = pose.neck.add(
          rotateDeg(off(`${ear}EarBase`).sub(off('neck')), headBob),
        );
        pose[`${ear}EarBase`] = base;
        const drag = Math.sin(ph * 2 - 1.1 + lag) * amp - 6;
        pose[`${ear}EarTip`] = base.add(
          rotateDeg(off(`${ear}EarTip`).sub(off(`${ear}EarBase`)), drag),
        );
      }
    };
  },

  /** Stand still and breathe. */
  idle(rig: Rig, opts: QuadrupedIdleOptions = {}): PoseFn {
    const breathe = opts.breathe ?? 3;
    const period = opts.period ?? 1.2;
    const at =
      opts.at ??
      new Vector2(
        opts.x ?? 0,
        (opts.groundY ?? 0) - rig.restOffset('frontLeftAnkle').y,
      );
    return t => {
      const root = at.add(
        new Vector2(0, Math.sin((2 * Math.PI * t) / period) * breathe),
      );
      const m: Pose = {[rig.template.root]: root};
      for (const r of Object.keys(rig.joints)) {
        m[r] = root.add(rig.restOffset(r));
      }
      return m;
    };
  },
};
