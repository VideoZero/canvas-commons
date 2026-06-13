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

## Quick start — extract, overlay, compose

The fast path is three calls: **extract** a rig from an SVG, **overlay** a generic
clip from the animation library, and **bind** it to a clock. The skeleton template
(biped vs quadruped) is auto-detected from the reference-point roles.

```ts
import {bindPose, biped, rigFromSvg} from '@motion-canvas/rig';

const clock = createSignal(0);

// 1. EXTRACT — parse + build in one call (template auto-detected).
const hero = rigFromSvg(HERO_SVG, {render: 'svg', renderParts});
view.add(hero.node);

// 2. OVERLAY — a generic clip, tuned to your scene's ground + speed.
bindPose(hero, clock, biped.walk(hero, {groundY: 320, startX: -500, speed: 120}));

// 3. drive the clock however you like (tween, signal, playback).
yield * tween(4, p => clock(p * 4));
```

Every clip reads the rig's **own bone lengths**, so the same `biped.walk(...)`
call retargets across characters of different proportions.

### Compose overlays

`compose(base, ...layers)` stacks overlay animations (a wave, a tail wag, a head
nod) on top of a base pose. A base is any `(t) => Pose`; a layer is any
`(t, pose) => void` that mutates only the joints it animates.

```ts
import {compose, biped} from '@motion-canvas/rig';

bindPose(panda, clock, compose(
  biped.idle(panda, {groundY: 320}),
  biped.wave(panda, {arm: 'right'}),
));
```

### Sequence + cross-fade (state machine)

`sequence(segments)` / `stateMachine(states)` play clips one after another with
short cross-fades, blending poses per joint through the hand-off. Everything stays
a pure function of `t`, so scrubbing the timeline is deterministic.

```ts
import {bindPose, biped, stateMachine} from '@motion-canvas/rig';

bindPose(hero, clock, stateMachine({
  idle: biped.idle(hero, {groundY: 320, x: 0}),
  walk: biped.walk(hero, {groundY: 320, startX: 0, speed: 120}),
  run:  biped.run(hero,  {groundY: 320, startX: 168, speed: 300}),
})
  .to('idle', {duration: 1})
  .to('walk', {duration: 1.4, blend: 0.3})
  .to('run',  {blend: 0.3})
  .build());
```

> Clips evaluate in **local time** (τ = 0 when a segment starts), so a `walk`
> begins a fresh stride. Position continuity across cuts assumes neighbouring
> clips share ground placement — thread each clip's `startX` so the body doesn't
> jump, and keep blends short (≈0.2–0.4 s) to avoid foot-slide during the fade.

## Animation libraries

Generic clips keyed by skeleton. Pass options to override any default; omit them
to derive sensible values from the rig's proportions.

| Skeleton | Bases `(t) ⇒ Pose` | Overlays `(t, pose) ⇒ void` |
| --- | --- | --- |
| `biped` | `walk`, `run`, `jump`, `idle` | `wave` |
| `quadruped` | `walk`, `run`, `idle` | `wagTail`, `flickEars` |
| any (head) | — | `nod`, `lookAt({target})` |

Sequencing helpers: `sequence`, `stateMachine`, `blendPoses`. Secondary motion:
`springChain` (traveling-wave drag for tails/tentacles/cloth).

### Continuous locomotion (`locomotion`)

For a single character that smoothly **accelerates from a stand through a walk
into a run and brakes to a stop**, prefer `locomotion` over sequencing separate
`walk`/`run` clips. It is a velocity-driven controller: you give it a speed
timeline and it shapes one consistent gait (cadence, stride, duty, lift, lean,
arm carriage all scale with speed). Because each foot is **locked to the world**
the instant it plants, the walk→run speed-up never slides a foot; and the torso
is an inertial damped spring, so it **overshoots and rocks back** when the body
decelerates — visible weight. Pure in `t` (re-integrated from 0), so it stays
seek-deterministic.

```ts
bindPose(hero, clock, locomotion(hero, {
  groundY: 320, startX: -500,
  speed: [
    {t: 0, speed: 0}, {t: 0.8, speed: 0},     // idle
    {t: 1.7, speed: 130}, {t: 3, speed: 130}, // accelerate, walk
    {t: 3.8, speed: 260}, {t: 5, speed: 260}, // accelerate, run
    {t: 5.7, speed: 0},                        // brake → overshoot → settle
  ],
}));
```

## Writing a custom clip

A clip needs no special type — it's just a function. Read the rig's rest offsets
and bone lengths, return world-space joint positions, and keep it pure in `t`
(no `Date.now` / `Math.random`) so seeking stays deterministic.

```ts
import {Vector2} from '@motion-canvas/core';
import {rotateDeg, type PoseFn} from '@motion-canvas/rig';

// A base: bob the whole body and tilt the head.
const sway = (rig): PoseFn => t => {
  const root = new Vector2(0, Math.sin(t * 2) * 6);
  const m = {[rig.template.root]: root};
  for (const r of Object.keys(rig.joints)) m[r] = root.add(rig.restOffset(r));
  return m;
};

// A layer: nudge one joint, leave the rest untouched.
const tiltHead = (rig) => (t, pose) => {
  pose.headCenter = pose.neck.add(
    rotateDeg(rig.restOffset('headCenter').sub(rig.restOffset('neck')), Math.sin(t * 3) * 10),
  );
};
```

For lower-level posing, write world-space joint positions directly — FK, the
generic N-bone `fabrik()` solver, or by hand:

```ts
import {Rig, BIPED, parseCharacterSvg} from '@motion-canvas/rig';

const rig = new Rig(parseCharacterSvg(MY_SVG), BIPED, {scale: 0.8, render: 'svg'});
view.add(rig.node);
rig.set('leftHip', somePoint);
```

Joints live in **world space** (the rig's container node sits at the origin), so
IK targets — like a planted foot — are expressed directly and never slide.
