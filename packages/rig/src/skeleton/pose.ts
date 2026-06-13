import {Vector2} from '@motion-canvas/core';
import {fabrik} from '../ik';
import {Rig} from './rig';
import type {ChainDef} from './types';

/**
 * Forward-kinematics: place every joint by walking the template hierarchy from
 * the root, applying each joint's rest offset rotated by an optional per-joint
 * angle (degrees, relative to the parent). Joints listed in `solved` are left
 * untouched (e.g. already positioned by IK).
 */
export function poseFK(
  rig: Rig,
  rootWorld: Vector2,
  angles: Record<string, number> = {},
  solved: Set<string> = new Set(),
) {
  const t = rig.template;
  // Topological order is guaranteed by parent-before-child template authoring.
  const order = Object.keys(t.parents);
  const worldAngle: Record<string, number> = {[t.root]: 0};

  for (const role of order) {
    if (!rig.joints[role]) continue;
    const parent = t.parents[role];
    if (parent === null) {
      rig.set(t.root, rootWorld);
      worldAngle[t.root] = (angles[t.root] ?? 0) * (Math.PI / 180);
      continue;
    }
    const wa = (worldAngle[parent] ?? 0) + (angles[role] ?? 0) * (Math.PI / 180);
    worldAngle[role] = wa;
    if (solved.has(role)) continue; // IK owns this joint
    const rest = rig.restOffset(role).sub(rig.restOffset(parent));
    const ca = Math.cos(wa);
    const sa = Math.sin(wa);
    const rotated = new Vector2(rest.x * ca - rest.y * sa, rest.x * sa + rest.y * ca);
    rig.set(role, rig.get(parent).add(rotated));
  }
}

/**
 * Solve one IK chain with FABRIK and write the resulting joint positions back
 * into the rig. The chain's base joint must already be posed (e.g. by FK).
 */
export function solveChain(
  rig: Rig,
  chain: ChainDef,
  target: Vector2,
  poleBias: Vector2 = new Vector2(16, 0),
) {
  const roles = chain.joints;
  const base = rig.get(roles[0]);
  const lengths: number[] = [];
  for (let i = 0; i < roles.length - 1; i++) {
    lengths.push(rig.boneLength(roles[i], roles[i + 1]));
  }
  // Seed from the current joint positions, nudging interior joints toward the
  // pole so the chain bends in a stable, predictable direction.
  const seed = roles.map((r, i) =>
    i === 0 || i === roles.length - 1 ? rig.get(r) : rig.get(r).add(poleBias),
  );
  const solved = fabrik(base, target, lengths, seed);
  roles.forEach((r, i) => rig.set(r, solved[i]));
}
