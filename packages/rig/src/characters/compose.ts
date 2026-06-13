import type {Pose, PoseFn} from './bind';

/**
 * A pose modifier: reads/overwrites joints in an existing pose at time `t`.
 * Overlay animations (a wave, a tail wag, a head turn) are layers — they run
 * after a base pose and touch only the joints they animate.
 */
export type PoseLayer = (t: number, pose: Pose) => void;

/**
 * Overlay layers on top of a base animation. The base produces the full pose;
 * each layer then mutates it in order (later layers win). The result is a
 * {@link PoseFn} you hand to {@link bindPose}.
 *
 * ```ts
 * bindPose(panda, clock, compose(
 *   biped.idle(panda, {at}),
 *   biped.wave(panda, {arm: 'right'}),
 * ));
 * ```
 *
 * Custom animations need no special type — a base is any `(t) => Pose`, a layer
 * is any `(t, pose) => void`.
 */
export function compose(base: PoseFn, ...layers: (PoseLayer | undefined | null)[]): PoseFn {
  return t => {
    const pose = base(t);
    for (const layer of layers) layer?.(t, pose);
    return pose;
  };
}
