import {Vector2} from '@canvas-commons/core';
import type {ParsedCharacter} from './parse';

/**
 * Build a character from plain reference points, without any SVG art.
 *
 * @remarks
 * Useful for procedural rigs (a tentacle, a rope, a template drawn with the
 * `'bones'` render mode) where there is nothing to slice.
 *
 * @example
 * ```ts
 * const rope = new Rig(
 *   syntheticChar({p0: [0, 0], p1: [0, 40], p2: [0, 80]}, [-50, 0, 100, 100]),
 *   curveTemplate(2),
 * );
 * ```
 *
 * @param points - The position of each joint, by role.
 * @param viewBox - The viewBox of the character.
 */
export function syntheticChar(
  points: Record<string, [number, number]>,
  viewBox: [number, number, number, number],
): ParsedCharacter {
  const referencePoints: ParsedCharacter['referencePoints'] = {};
  for (const [role, [x, y]] of Object.entries(points)) {
    referencePoints[role] = {id: role, role, pos: new Vector2(x, y)};
  }
  return {viewBox, referencePoints, parts: {}, layers: {}, rawSvg: ''};
}
