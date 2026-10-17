export {bindPose} from './bind';
export type {Pose, PoseFn} from './bind';
export {compose} from './compose';
export type {PoseLayer} from './compose';
export {springChain} from './drag';
export type {SpringChainOptions} from './drag';
export {lookAt, nod, wave} from './gestures';
export type {LookAtOptions, NodOptions, WaveOptions} from './gestures';
export {plantedFoot, plantedFootAt, solveLimb, walkBody} from './walk';
export type {
  FootTargetOptions,
  PlantedFootOptions,
  WalkBodyOptions,
} from './walk';

export {blendPoses, sequence, stateMachine} from './state-machine';
export type {Segment, StateMachineBuilder} from './state-machine';

export {locomotion} from './locomotion';
export type {LocomotionOptions, SpeedKey} from './locomotion';

export {biped} from './biped';
export type {
  BipedIdleOptions,
  BipedJumpOptions,
  BipedWalkOptions,
  BipedWaveOptions,
} from './biped';
export {quadruped} from './quadruped';
export type {
  FlickEarsOptions,
  QuadrupedIdleOptions,
  QuadrupedWalkOptions,
  WagTailOptions,
} from './quadruped';
