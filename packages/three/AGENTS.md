# @canvas-commons/three

Three.js 3D scenes as nodes. `Three` (a `Rect`) renders its 3D children through
one WebGL renderer shared by every node and draws the image between its fill and
stroke. Three.js is a peer dependency, loaded on first render through a
replaceable loader. See `README.md` for the user-facing reference.

See the [root `AGENTS.md`](../../AGENTS.md) for repo-wide standards.

## Commands

```bash
pnpm three:build                                  # tsdown
pnpm three:test                                   # vitest run
pnpm --filter @canvas-commons/three run lint:pkg
```

## Where things live

```
src/ThreeNode.ts     The viewport: camera, fog, lights, render state, drawing.
src/Object3DNode.ts  Base of the 3D nodes: transform sync, screen projection.
src/Mesh3D.ts        Primitives, materials, shader patches, surface content.
src/Light3D.ts       Lights. src/Group3D.ts, src/Object3D.ts: groups, raw objects.
src/loader.ts        The runtime and addon loader, with a load-state signal.
src/renderer.ts      The shared renderer: context loss, antialias, render state.
src/environment.ts   The procedural studio environment.
```

## Traps

**Every access to the runtime reads a signal.** `getThree()` reads the load
state before it throws, so a computed that asked too early re-runs after the
load instead of staying cached without dependencies.

**User callbacks never throw out of a sync.** `onUpdate`, `onRender`, and the
`create` / `update` of `Object3D` run inside computed values; an escaping error
would leave the parent's sync without a value and blank the whole viewport. They
are logged against the node instead.

**Surface content renders into a private `View2D`.** `Mesh3D.view()` returns it
while the mesh has 2D children, which makes the mesh a layout boundary (see
`Layout.parentTransform()`): layouts outside never place the content, and
percent sizes resolve against the surface.

**Tests have no WebGL and no 2D canvas.** `src/__tests__/fakes.ts` provides a
recording 2D context, a fake `WebGLRenderer` and a fake `TextureLoader`;
register `FAKE_THREE` with `configureThree({module})` to render in tests.
