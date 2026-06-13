# @motion-canvas/rig

Composable 2D rigging, IK, and character animation for Motion Canvas.

Define arbitrary rigs from annotated SVG art, retarget a single skeleton onto
many characters by role, and pose them with a generic N-bone FABRIK solver —
all without modifying the engine's `SVG` component.

## Layers

The package is three independent layers so rigging is not welded to rendering:

| Layer | Entry | Responsibility |
| ----- | ----- | -------------- |
| **Parse** | `@motion-canvas/rig/svg` | `parseCharacterSvg()` → a data model of reference points (joints, by role) and rig parts (each sliced into a standalone sub-SVG). |
| **Solve** | `@motion-canvas/rig/ik`, `@motion-canvas/rig/gaits` | `fabrik()` N-bone IK + `SkeletonTemplate`s (`BIPED`, `QUADRUPED`, `curveTemplate`) describing joint hierarchies and IK chains by role. |
| **Bind** | `@motion-canvas/rig` | `Rig` builds nodes and binds them to world-space joint signals; renders as primitive bones or the character's own sliced art. |

## Annotating an SVG

- `<circle data-reference-point="leftHip" cx cy>` — an (invisible) joint / anchor.
- `<g data-rig-part="leftUpperArm" data-pivot-ref="leftShoulder" data-end-ref="leftElbow">` — a riggable body part.

## Example

```ts
import {Rig, BIPED, parseCharacterSvg, fabrik} from '@motion-canvas/rig';

const char = parseCharacterSvg(MY_SVG);
const rig = new Rig(char, BIPED, {scale: 0.8, render: 'svg'});
view.add(rig.node);

// Pose by writing world-space joint positions — FK, FABRIK, or hand-authored.
rig.set('leftHip', somePoint);
```

Joints live in **world space** (the rig's container node sits at the origin), so
IK targets — like a planted foot — are expressed directly and never slide.
