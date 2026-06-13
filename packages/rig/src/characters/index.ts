export {bindPose} from './bind';
export type {Pose, PoseFn} from './bind';
export {compose} from './compose';
export type {PoseLayer} from './compose';
export {plantedFoot, walkBody, solveLimb} from './walk';
export type {PlantedFootOptions, WalkBodyOptions} from './walk';
export {springChain} from './drag';
export type {SpringChainOptions} from './drag';
export {wave} from './gestures';
export type {WaveOptions} from './gestures';

// Per-skeleton animation libraries — overlay these onto a rig with `compose`.
export {biped} from './biped';
export type {BipedWalkOptions, BipedIdleOptions, BipedWaveOptions} from './biped';
export {quadruped} from './quadruped';
export type {
  QuadrupedWalkOptions,
  QuadrupedIdleOptions,
  WagTailOptions,
  FlickEarsOptions,
} from './quadruped';
