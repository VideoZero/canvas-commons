export {bindPose} from './bind';
export type {Pose, PoseFn} from './bind';
export {compose} from './compose';
export type {PoseLayer} from './compose';
export {plantedFoot, plantedFootAt, walkBody, solveLimb} from './walk';
export type {PlantedFootOptions, FootTargetOptions, WalkBodyOptions} from './walk';
export {springChain} from './drag';
export type {SpringChainOptions} from './drag';
export {wave, nod, lookAt} from './gestures';
export type {WaveOptions, NodOptions, LookAtOptions} from './gestures';

// Sequencing + cross-fading clips into a single timeline.
export {blendPoses, sequence, stateMachine} from './state-machine';
export type {Segment, StateMachineBuilder} from './state-machine';

// Continuous, velocity-driven biped locomotion (foot-locked, inertial torso).
export {locomotion} from './locomotion';
export type {LocomotionOptions, SpeedKey} from './locomotion';

// Per-skeleton animation libraries — overlay these onto a rig with `compose`.
export {biped} from './biped';
export type {BipedWalkOptions, BipedIdleOptions, BipedWaveOptions, BipedJumpOptions} from './biped';
export {quadruped} from './quadruped';
export type {
  QuadrupedWalkOptions,
  QuadrupedIdleOptions,
  WagTailOptions,
  FlickEarsOptions,
} from './quadruped';
