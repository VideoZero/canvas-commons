/**
 * @motion-canvas/rig — composable 2D rigging, IK, and character animation.
 *
 * Three independent layers, so rigging is not welded to the SVG component:
 *
 *   1. PARSE   `parseCharacterSvg()` (`/svg`) turns an annotated SVG into a
 *              plain data model: reference points (by role), rig parts (each
 *              sliced into its own standalone sub-SVG), and layers.
 *
 *   2. SOLVE   `fabrik()` (`/ik`) is a generic N-bone Forward-And-Backward-
 *              Reaching IK solver. `SkeletonTemplate`s (`/gaits`: biped /
 *              quadruped / curve) describe joint hierarchies and IK chains by
 *              ROLE, so one template retargets onto any character whose
 *              reference points use the matching roles.
 *
 *   3. BIND    `Rig` builds Motion-Canvas nodes for a character and binds them
 *              to world-space joint signals. Two render modes share the exact
 *              same binding math:
 *                • 'bones' — primitive Line/Circle bones (e.g. a stickman)
 *                • 'svg'   — the character's own sliced <g> art follows the
 *                            bones (e.g. a panda), no engine changes required.
 *
 * Joints live in WORLD space (the rig's container node sits at the origin), so
 * IK targets — like a planted foot — are expressed directly and never slide.
 */

// 1. PARSE
export {parseCharacterSvg, parseSvgRig} from './svg';
export type {ReferencePoint, PartDef, ParsedCharacter} from './svg';

// 2. SOLVE
export {Fabrik, fabrik} from './ik';
export {BIPED, QUADRUPED, curveTemplate} from './gaits';

// 3. BIND
export {Rig, poseFK, solveChain} from './skeleton';
export type {RigOptions, BoneDef, ChainDef, SkeletonTemplate} from './skeleton';
