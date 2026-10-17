import {Vector2} from '@canvas-commons/core';
import {fabrik} from '../ik';
import {rotateDeg} from '../util/vec';
import type {Rig} from './rig';
import type {ChainDef} from './types';

/**
 * Pose a rig with forward kinematics.
 *
 * @remarks
 * Walks the template hierarchy from the root and places every joint at its
 * rest offset from its parent, rotated by the accumulated per-joint angles.
 * Joints listed in `solved` are left untouched, for example because inverse
 * kinematics already placed them.
 *
 * @example
 * ```ts
 * poseFK(rig, new Vector2(0, 0), {leftShoulder: -30, leftElbow: 20});
 * ```
 *
 * @param rig - The rig to pose.
 * @param rootWorld - The world position of the root joint.
 * @param angles - The rotation of each joint relative to its parent, in
 *                 degrees.
 * @param solved - The joints to leave untouched.
 */
export function poseFK(
  rig: Rig,
  rootWorld: Vector2,
  angles: Record<string, number> = {},
  solved: Set<string> = new Set(),
) {
  const template = rig.template;
  const worldAngle: Record<string, number> = {[template.root]: 0};

  for (const [role, parent] of Object.entries(template.parents)) {
    if (!rig.joints[role]) continue;
    if (parent === null) {
      rig.set(template.root, rootWorld);
      worldAngle[template.root] = angles[template.root] ?? 0;
      continue;
    }
    const angle = (worldAngle[parent] ?? 0) + (angles[role] ?? 0);
    worldAngle[role] = angle;
    if (solved.has(role)) continue;
    const rest = rig.restOffset(role).sub(rig.restOffset(parent));
    rig.set(role, rig.get(parent).add(rotateDeg(rest, angle)));
  }
}

/**
 * Solve one chain of a rig with {@link fabrik} and write the resulting joint
 * positions back into the rig.
 *
 * @remarks
 * The base joint of the chain must already be posed, for example with
 * {@link poseFK}.
 *
 * @example
 * ```ts
 * const leg = BIPED.chains.find(chain => chain.name === 'legL');
 * if (leg) solveChain(rig, leg, new Vector2(-20, 300));
 * ```
 *
 * @param rig - The rig to pose.
 * @param chain - The chain to solve.
 * @param target - The world position the effector should reach.
 * @param poleBias - The offset applied to interior joints before solving,
 *                   which decides the direction the chain bends in.
 */
export function solveChain(
  rig: Rig,
  chain: ChainDef,
  target: Vector2,
  poleBias: Vector2 = new Vector2(16, 0),
) {
  const roles = chain.joints;
  if (roles.length === 0) return;
  const base = rig.get(roles[0]);
  const lengths: number[] = [];
  for (let i = 0; i < roles.length - 1; i++) {
    lengths.push(rig.boneLength(roles[i], roles[i + 1]));
  }
  const seed = roles.map((role, i) =>
    i === 0 || i === roles.length - 1
      ? rig.get(role)
      : rig.get(role).add(poleBias),
  );
  const solved = fabrik(base, target, lengths, seed);
  roles.forEach((role, i) => rig.set(role, solved[i]));
}
