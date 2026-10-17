/**
 * Composable 2D rigging, inverse kinematics, and character animation.
 *
 * @remarks
 * The package has three independent layers:
 *
 * - Parse: {@link parseCharacterSvg} turns an annotated SVG into reference
 *   points (joints, by role) and rig parts (each sliced into its own SVG).
 * - Solve: {@link fabrik} is an N-bone inverse kinematics solver, and
 *   {@link SkeletonTemplate}s describe joint hierarchies by role, so one
 *   template retargets onto any character that uses the same roles.
 * - Bind: {@link Rig} builds nodes for a character and binds them to joint
 *   signals, drawn either as primitive bones or as the character's own art.
 *
 * @packageDocumentation
 */

export {detectTemplate, rigFromSvg} from './extract';
export type {RigFromSvgOptions} from './extract';
export {BIPED, QUADRUPED, curveTemplate} from './gaits';
export {Fabrik, fabrik} from './ik';
export {Rig, poseFK, solveChain} from './skeleton';
export type {
  BoneDef,
  ChainDef,
  RigDebugOptions,
  RigOptions,
  SkeletonTemplate,
} from './skeleton';
export {parseCharacterSvg, parseSvgRig, syntheticChar} from './svg';
export type {ParsedCharacter, PartDef, ReferencePoint} from './svg';
export {rotateDeg, smoothstep} from './util';
