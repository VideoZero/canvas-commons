import type {Pose, PoseFn} from './bind';
import {smoothstep} from '../util/vec';

/**
 * Per-joint linear blend between two poses at mix `u ∈ [0,1]` (0 = `a`, 1 = `b`).
 *
 * Joints present in only one pose are passed through unchanged — so blending a
 * full-body walk into an idle that omits, say, the tail still animates every
 * joint. Pass a smoothstepped `u` for an ease-in-out cross-fade.
 */
export function blendPoses(a: Pose, b: Pose, u: number): Pose {
  const out: Pose = {};
  for (const k in a) out[k] = k in b ? a[k].lerp(b[k], u) : a[k];
  for (const k in b) if (!(k in a)) out[k] = b[k];
  return out;
}

/** One step of a {@link sequence}: a clip and how long it plays before the next. */
export interface Segment {
  /** The clip to play. Evaluated in **local time** (τ = 0 when this segment starts). */
  clip: PoseFn;
  /** Seconds this segment plays before the next begins. Omit on the last segment (plays forever). */
  duration?: number;
  /** Cross-fade seconds INTO this clip from the previous one (default 0 — a hard cut). */
  blend?: number;
}

/**
 * Sequence clips on a timeline with optional cross-fades — the core of the
 * animation state machine. Returns a {@link PoseFn} you hand to `bindPose`.
 *
 * Each segment is evaluated in **local time** (τ = t − segmentStart), so every
 * clip begins at its own τ=0 — a `walk` starts a fresh stride, an `idle` starts
 * its breathe cycle. During a segment's `blend` window the previous clip keeps
 * running (in its own local time) and the two poses are lerped per joint with a
 * smoothstep, giving a smooth hand-off instead of a pop.
 *
 * The whole thing is a pure function of `t`: the segment list is fixed up front,
 * so scrubbing the timeline is fully deterministic.
 *
 * ```ts
 * bindPose(dog, clock, sequence([
 *   {clip: quadruped.idle(dog, {groundY}),               duration: 1.5},
 *   {clip: quadruped.walk(dog, {groundY}), blend: 0.4,   duration: 4},
 *   {clip: quadruped.idle(dog, {groundY}), blend: 0.4},
 * ]));
 * ```
 *
 * **Gotcha:** blending two locomotion clips whose feet are at different phases
 * (or different ground speeds) foot-slides through the blend window. Keep blends
 * short (≈0.2–0.4 s), match `period`, or transition through an idle. Position
 * continuity assumes neighbouring clips share `startX` / ground placement.
 */
export function sequence(segments: Segment[]): PoseFn {
  const starts: number[] = [];
  let acc = 0;
  for (const s of segments) {
    starts.push(acc);
    acc += s.duration ?? Infinity;
  }
  return t => {
    let i = 0;
    for (let k = 0; k < segments.length; k++) if (t >= starts[k]) i = k;
    const seg = segments[i];
    const pose = seg.clip(t - starts[i]);
    const blend = seg.blend ?? 0;
    if (i > 0 && blend > 0 && t - starts[i] < blend) {
      const prev = segments[i - 1];
      const prevPose = prev.clip(t - starts[i - 1]); // prev keeps running through the fade
      return blendPoses(prevPose, pose, smoothstep((t - starts[i]) / blend));
    }
    return pose;
  };
}

/** Fluent builder returned by {@link stateMachine}. */
export interface StateMachineBuilder {
  /** Append a state to the timeline. `duration` omitted on the last call → plays forever. */
  to(state: string, opts?: {duration?: number; blend?: number}): StateMachineBuilder;
  /** Finalize into a {@link PoseFn} for `bindPose`. */
  build(): PoseFn;
}

/**
 * Named-state convenience over {@link sequence}: register clips by name, then
 * script transitions imperatively. The recording is build-time and fixed, so the
 * result stays seek-deterministic.
 *
 * ```ts
 * const pose = stateMachine({
 *   idle: biped.idle(rig, {groundY}),
 *   walk: biped.walk(rig, {groundY}),
 *   run:  biped.run(rig, {groundY}),
 * })
 *   .to('idle', {duration: 1})
 *   .to('walk', {duration: 3, blend: 0.3})
 *   .to('run',  {duration: 3, blend: 0.3})
 *   .to('idle', {blend: 0.4})
 *   .build();
 * bindPose(rig, clock, pose);
 * ```
 */
export function stateMachine(states: Record<string, PoseFn>): StateMachineBuilder {
  const segs: Segment[] = [];
  const api: StateMachineBuilder = {
    to(state, opts = {}) {
      const clip = states[state];
      if (!clip) throw new Error(`stateMachine: unknown state '${state}'`);
      segs.push({clip, duration: opts.duration, blend: opts.blend});
      return api;
    },
    build: () => sequence(segs),
  };
  return api;
}
