# @videozero/compat

Private compatibility layer for scenes written for the VideoZero fork of Motion
Canvas, running on Canvas Commons (`videozero-cc`).

It contains only the VideoZero animation shorthands, as subclasses of the Canvas
Commons nodes, plus an opt-in function that re-applies the VideoZero defaults.
Nothing is patched: importing the package changes no behaviour.

- `AnimTxt extends Txt`: the VideoZero text helpers (`typewriter`, `fadeUp`,
  `revealUp`, `wordByWord`, `scramble`, `fadeOutUp`, `swapOut`, ...) with their
  VideoZero names, positional parameters and defaults, and `splitChars()` /
  `unsplit()` / `chars` / `words` / `lineChars()` for manual per-character
  animation.
- `AnimLayout extends Layout`: `addAnimated`, `insertAnimated`,
  `removeAnimated`, `reorderAnimated`, `recordFlipState`, `tweenFlip`,
  `lockSize` and `releaseSize`.
- `applyVideoZeroDefaults()` and `applyVideoZeroViewDefaults(view)`.

```tsx
import {makeScene2D} from '@canvas-commons/2d';
import {createRef, waitFor} from '@canvas-commons/core';
import {AnimTxt, applyVideoZeroViewDefaults} from '@videozero/compat';

export default makeScene2D(function* (view) {
  applyVideoZeroViewDefaults(view);
  const title = createRef<AnimTxt>();
  view.add(<AnimTxt ref={title} text="Hello" fontSize={96} opacity={0} />);
  yield* title().fadeUp();
  yield* waitFor(1);
  yield* title().fadeOutUp();
});
```

```ts
// project.ts
import {makeProject} from '@canvas-commons/core';
import {applyVideoZeroDefaults} from '@videozero/compat';
import example from './scenes/example?scene';

applyVideoZeroDefaults();

export default makeProject({scenes: [example]});
```

Everything else that changed between VideoZero and Canvas Commons is a breaking
change, listed with its fix in [MIGRATION.md](./MIGRATION.md).

## Development

```bash
pnpm --filter @videozero/compat run build
pnpm --filter @videozero/compat run test
pnpm --filter @videozero/compat run typecheck
```

The package depends on the built `lib` of `@canvas-commons/core` and
`@canvas-commons/2d`; build those first.

The `cc/*` branches behind `videozero-cc`, their stacking order and what is
still open are listed in [BRANCHES.md](./BRANCHES.md).
