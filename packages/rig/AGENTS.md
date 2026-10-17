# @canvas-commons/rig

2D rigging, inverse kinematics, and character animation on top of `core` and
`2d`. Characters come from annotated SVGs (or plain point maps), skeleton
templates describe joints by role, and animations are pure functions of time
bound to a rig with `bindPose`.

See the [root `AGENTS.md`](../../AGENTS.md) for repo-wide standards.

## Commands

```bash
pnpm rig:build                                # tsdown
pnpm rig:test                                 # vitest run (jsdom)
pnpm --filter @canvas-commons/rig run typecheck
pnpm --filter @canvas-commons/rig run lint:pkg
```

## Where things live

```
src/svg/          SVG parsing (reference points, parts) and synthetic characters.
src/ik/           The FABRIK solver.
src/gaits/        Skeleton templates: BIPED, QUADRUPED, curveTemplate(n).
src/skeleton/     Rig (nodes + joint signals), poseFK, solveChain.
src/characters/   Pose functions: bindPose, compose, gaits, gestures,
                  sequencing, locomotion, springChain.
src/extract.ts    rigFromSvg and template detection.
```

## Traps

**Poses must stay pure in `t`.** `bindPose` caches one pose per clock value and
the editor seeks backwards; a pose that keeps state between calls (stored
velocity, `Math.random`) breaks scrubbing. `locomotion` re-integrates from zero
on every call for this reason.

**Joints live in the rig node's space.** Add `rig.node` where the character
should be; do not move the node to walk the character, move the root joint.

**`parseCharacterSvg` needs `DOMParser` for parts.** Without it (in Node.js)
only `<circle>` reference points are parsed.
