import {Vector2} from '@motion-canvas/core';
import type {ParsedCharacter} from './parse';

/**
 * Build a {@link ParsedCharacter} from a plain `role → [x, y]` map — a skeleton
 * with reference points but no SVG art. Handy for procedural rigs (a tentacle,
 * a rope, a bare template you render as 'bones') where there is nothing to slice.
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
