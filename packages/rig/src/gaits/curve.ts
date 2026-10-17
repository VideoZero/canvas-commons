import type {BoneDef, SkeletonTemplate} from '../skeleton/types';

/**
 * A generic open chain of `n` segments (roles `p0…pn`) — for mapping arbitrary
 * art onto a single deformable curve: tentacles, spines, ropes, antennae…
 *
 * @example
 * ```ts
 * const tentacle = new Rig(syntheticChar(points, viewBox), curveTemplate(8));
 * ```
 */
export function curveTemplate(n: number): SkeletonTemplate {
  const parents: Record<string, string | null> = {p0: null};
  const bones: BoneDef[] = [];
  const joints: string[] = ['p0'];
  for (let i = 1; i <= n; i++) {
    parents[`p${i}`] = `p${i - 1}`;
    bones.push({
      name: `seg${i}`,
      pivot: `p${i - 1}`,
      end: `p${i}`,
      kind: 'line',
      width: 6,
    });
    joints.push(`p${i}`);
  }
  return {
    id: `curve${n}`,
    root: 'p0',
    parents,
    bones,
    chains: [{name: 'curve', joints}],
  };
}
