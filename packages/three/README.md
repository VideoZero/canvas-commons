# @motion-canvas/three

Three.js 3D scenes as Motion Canvas nodes. Every property is a signal, so 3D
objects tween, chain and compose exactly like 2D nodes.

```tsx
import {Txt, makeScene2D} from '@motion-canvas/2d';
import {all, createRef} from '@motion-canvas/core';
import {Mesh3D, Three} from '@motion-canvas/three';

export default makeScene2D(function* (view) {
  const stage = createRef<Three>();
  const cube = createRef<Mesh3D>();
  view.add(
    <Three
      ref={stage}
      width={960}
      height={540}
      fill="#0f172a"
      radius={24}
      cameraPitch={20}
      cameraYaw={-25}
      shadows
    >
      <Mesh3D ref={cube} geometry="box" size={220} color="#38bdf8" />
      <Mesh3D
        geometry="plane"
        size={[1600, 1600]}
        rotationX={90}
        y={110}
        color="#1f2937"
      />
      <Txt
        text="cube"
        fill="#fff"
        position={() => cube().screenPosition().addY(-160)}
      />
    </Three>,
  );
  yield* all(
    cube().rotationY(180, 2),
    stage().cameraYaw(25, 2),
    cube().color('#f97316', 2),
  );
});
```

## Install

```sh
npm install @motion-canvas/three three
npm install -D @types/three   # for the Three.js types in props and escape hatches
```

Three.js 0.160 or newer. The runtime is loaded with a dynamic `import('three')`
the first time a `<Three>` node renders, so bundlers put it in its own chunk and
scenes without 3D never fetch it. Rendering (preview and export) waits for the
load the same way it waits for images. Export needs a browser with WebGL; the
headless renderer works with SwiftShader.

## Choose a mode

| When                                                            | You write                                              | Units inside                                           |
| --------------------------------------------------------------- | ------------------------------------------------------ | ------------------------------------------------------ |
| Product shots, charts, floating primitives, phone screens       | `Mesh3D`, `Group3D`, `Light3D` under `<Three>`         | pixels, y down, degrees (same as 2D)                   |
| One custom shape or an imported model, rest stays nodes         | `<Object3D create={three => ...} update={obj => ...}>` | props: as above; inside `create`/`update`: y up, rad   |
| Existing Three.js code, post-processing, your own camera/lights | `<Three scene={scene} camera={camera} onUpdate={...}>` | yours (metres, radians, y up); orbit props are ignored |

Start with nodes. Reach for `Object3D` when one shape is not a primitive, and
for the raw mode only when you already have a Three.js scene.

```tsx
// Object3D: one custom mesh among nodes
<Three width={800} height={600}>
  <Object3D
    create={three =>
      new three.Mesh(
        new three.TorusKnotGeometry(90, 28, 160, 24),
        new three.MeshStandardMaterial({color: '#f472b6'}),
      )
    }
  />
</Three>
```

```tsx
// Raw scene: you own units, camera, lights and determinism
import {Txt, makeScene2D} from '@motion-canvas/2d';
import {createRef, createSignal} from '@motion-canvas/core';
import {Three, toRadians} from '@motion-canvas/three';
import * as THREE from 'three';

export default makeScene2D(function* (view) {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
  camera.position.set(0, 3, 9);
  camera.lookAt(0, 0, 0);
  const knot = new THREE.Mesh(
    new THREE.TorusKnotGeometry(1.2, 0.4),
    new THREE.MeshStandardMaterial({color: '#f472b6'}),
  );
  scene.add(knot, new THREE.HemisphereLight('#fff', '#334155', 1));

  const stage = createRef<Three>();
  const spin = createSignal(0);
  view.add(
    <Three
      ref={stage}
      width={1100}
      height={760}
      scene={scene}
      camera={camera}
      onUpdate={() => {
        knot.rotation.y = toRadians(spin());
      }}
    >
      <Txt
        text="knot"
        position={() => stage().projectObject(knot).addY(-200)}
      />
    </Three>,
  );
  yield* spin(360, 4);
});
```

In raw mode every mutation must happen inside `onUpdate` (it is signal-tracked)
and derive from signals, never from clocks or cached state, or seeking breaks.
`zoom` still applies; the other camera props are ignored and the node warns. If
the scene imports `three` itself, `configureThree({module: THREE})` makes the
nodes reuse that instance instead of importing a second copy.

## Conventions

- **Pixels everywhere.** Positions and sizes are in pixels. In the camera's
  target plane a 200 px wide `plane` covers the same area as a 200 px `Rect`;
  with `orthographic` that holds at every depth. Under perspective the front
  face of a 200 px cube sits 100 px closer to the camera and reads about 7 %
  larger at the default distance. Internally 100 px = 1 Three.js unit
  (`PIXELS_PER_UNIT`), so glTF models and light falloff behave like in any
  Three.js tutorial.
- **Same axes as 2D nodes.** `x` right, `y` down, `z` toward the camera.
  `rotation` is clockwise on screen; `rotationX` tilts the top away; `rotationY`
  turns the right edge away. Degrees.
- **Reused signals.** `position`, `x`, `y`, `rotation`, `scale`, `opacity` are
  the standard Node signals; 3D adds `z`, `rotationX`, `rotationY`, `scaleZ`,
  `visible`.
- **Camera by orbit.** `cameraYaw`, `cameraPitch`, `cameraDistance`,
  `cameraTarget`, `zoom`, `fov` (auto by default), `orthographic`.
- **3D points are `[x, y, z]` tuples** (`cameraTarget`, `Light3D.target`,
  `projectPoint`); node placement is the 2D `position` / `x` / `y` plus `z`.
- **2D on top.** Ordinary 2D children of `<Three>` draw over the 3D image. Pin
  them with `node.screenPosition()` or `stage.projectPoint([x, y, z])`.
- **Lighting just works.** No `Light3D` in the scene → a neutral default rig.
  Add lights to art-direct; `shadows` on `<Three>` plus `castShadow` on a light.
- **Deterministic.** Everything is a pure function of signals; no clocks.

## Recipes

- **Grow from the floor.** `origin="bottom"` puts the pivot on the base:
  `<Mesh3D geometry="box" origin="bottom" y={floorY} size={() => [80, h(), 80]} />`
  then tween `h`. Label the top with `stage.projectPoint([x, floorY - h(), 0])`.
- **Rounded slab / phone / card.**
  `<Mesh3D geometry="box" radius={24} size={[300, 600, 24]} />`; put 2D nodes
  inside it for the screen (see below).
- **Fog and backdrop.** `fog="#1e1b4b" fogNear={1200} fogFar={3000}` (pixels
  from the camera; defaults are the camera distance and three times it) with
  `background="#1e1b4b"` or the same `fill`.
- **Fade a shot.** Tween the `Three` node's `opacity`: it fades the finished
  image. Per-object `opacity` makes materials transparent, which is right for
  thin or convex shapes but shows the far side of a knot or a model through its
  near side.
- **Nest transforms.** 3D children move with their parent, like Three.js
  objects. A parent's `size` scales only its own shape, so a child at `y={-120}`
  under a `300 × 100` box sits 120 px above the box's pivot.
- **Custom geometry on a `Mesh3D`.** `geometry={myBufferGeometry}` is used as is
  (author it in pixels, y up); `size`, `radius` and `origin` are ignored for it.
- **A glTF model.** Load it in `create` and let the renderer wait for it:
  ```tsx
  <Object3D
    create={three => {
      const holder = new three.Group();
      DependencyContext.collectPromise(
        new GLTFLoader().loadAsync('/model.glb').then(gltf => {
          gltf.scene.scale.setScalar(PIXELS_PER_UNIT);
          holder.add(gltf.scene);
        }),
      );
      return holder;
    }}
  />
  ```
- **Escape hatches need the runtime.** `stage.sceneObject()`, `mesh.object3D()`
  and friends throw before Three.js has loaded; call them from `onUpdate`, an
  `Object3D` `update`, or a signal function, not at setup. Inside a signal the
  throw is caught and logged, and the stale value is kept, so check
  `isThreeLoaded()` there.

## 2D content on a surface

Put ordinary 2D nodes inside a `Mesh3D` and they become its surface: a phone
screen, a floating card, a chart on a wall. The children are rasterized into a
texture and mapped onto the mesh, so they get perspective, occlusion and
lighting like any other geometry.

```tsx
const progress = createSignal(0);
view.add(
  <Three width={960} height={540} cameraPitch={15} cameraYaw={-20}>
    <Mesh3D
      geometry="box"
      radius={34}
      size={[320, 660, 22]}
      contentMaterial="basic"
    >
      <Rect size={[320, 660]} fill="#0f172a" radius={34} />
      <Txt y={-270} text="Nova" fontSize={40} fill="#fff" />
      <Txt
        text={() => `${Math.round(progress())} %`}
        fontSize={48}
        fill="#fff"
      />
    </Mesh3D>
  </Three>,
);
yield * progress(100, 2);
```

- **Coordinates.** The surface is the local space of the children: `(0, 0)` is
  the centre of the face, its edges are at `±width / 2` and `±height / 2` of the
  mesh's `size`. On a `box` (rounded or not) the content covers the front face
  and the other faces keep the body material; on every other primitive it wraps
  the whole surface and replaces the body material, so a sphere with a small
  label shows only the label. `map` is ignored while a mesh hosts content.
- **Shading.** `contentMaterial="basic"` makes the content glow like a screen;
  the default follows `material`, so a card is lit and shadowed by the scene. On
  a box the content is drawn over the lit body of the front face, so transparent
  areas (a margin around the screen, a rounded edge) show the body; on a plane
  they show what is behind, so a translucent panel is just a `Rect` with alpha.
  Transparent areas still cast a full shadow.
- **Layout.** The children lay out against the surface, not against the `Three`
  node or any `Layout` around it, so a `<Layout layout>` inside works as usual
  and the surface is unaffected by a flex parent of the viewport.
- **Resolution.** Content is rasterized at the resolution the `Three` node
  renders at (on-screen scale times `quality`, capped at 4096 texels), so it
  stays crisp under Camera zoom and 2x exports. `contentScale` overrides that
  per mesh; lower it for large surfaces far from the camera. Changing the size
  or scale re-creates the texture.
- **Cost.** The texture is re-drawn and re-uploaded only when a signal the
  content depends on changes. Camera moves, mesh transforms and opacity tweens
  of the mesh or the `Three` node are free; a mesh `size` tween or a counter
  ticking every frame costs one 2D render of the content plus one upload per
  frame (roughly 5–10 ms for a phone screen under headless SwiftShader,
  invisible on a GPU).
- **What works inside.** Anything that renders on the 2D canvas, including
  `Video`, `Img`, `Txt` with web fonts, layouts and cached nodes (opacity,
  filters, shadows). Shader-driven nodes are untested. `absolutePosition()` of a
  content child is a texel position, not a scene position; pin scene-level nodes
  with `mesh.screenPosition()` instead. 2D children of the `Three` node itself
  are still drawn as a crisp overlay on top of the image.

## Reference

Every prop is a signal (`SignalValue<T>`), so it accepts a value, a signal or a
function. Lengths are pixels, angles degrees, colours anything `Color` accepts.

### `Three` (extends `Rect`)

| Prop                | Type                                | Default   | Notes                                                                        |
| ------------------- | ----------------------------------- | --------- | ---------------------------------------------------------------------------- |
| `cameraDistance`    | `number`                            | `1600`    | Distance from `cameraTarget`; sets the perspective when `fov` is unset       |
| `cameraYaw`         | `number`                            | `0`       | Orbit around the vertical axis                                               |
| `cameraPitch`       | `number`                            | `0`       | Orbit above (`+`) or below the target                                        |
| `cameraTarget`      | `[x, y, z]`                         | `[0,0,0]` | The point the camera looks at                                                |
| `fov`               | `number \| null`                    | `null`    | Vertical field of view; `null` derives it so the target plane fills the node |
| `zoom`              | `number`                            | `1`       | `2` shows half the area at twice the size; also applies to raw cameras       |
| `orthographic`      | `boolean`                           | `false`   | No perspective; pixels are exact at every depth                              |
| `shadows`           | `boolean`                           | `false`   | Enables shadow maps; needs `castShadow` on a light                           |
| `defaultLights`     | `boolean`                           | `true`    | Neutral rig when the scene has no `Light3D`                                  |
| `background`        | `color \| null`                     | `null`    | Opaque backdrop inside the node (otherwise `fill` shows through)             |
| `fog`               | `color \| null`                     | `null`    | Fog colour; enables fog                                                      |
| `fogNear`, `fogFar` | `number \| null`                    | `null`    | Fog range from the camera; default `cameraDistance` and 3× it                |
| `quality`           | `number`                            | `1`       | Supersampling; `2` renders at twice the on-screen resolution                 |
| `scene`, `camera`   | `THREE.Scene`, `THREE.Camera`       | `null`    | Raw mode; orbit props are ignored when `camera` is set                       |
| `onUpdate`          | `() => void`                        |           | Signal-tracked; mutate raw objects here                                      |
| `onRender`          | `(renderer, scene, camera) => void` |           | Replaces the default `renderer.render` call, for post-processing             |

Methods: `projectPoint([x, y, z])`, `projectObject(object)`,
`projectWorld(vector)` → `Vector2` in the node's space; `sceneObject()`,
`cameraObject()`, `rootGroup()` → live Three.js objects (after load); `three()`
→ the runtime or `null`.

### Shared by `Mesh3D`, `Group3D`, `Light3D`, `Object3D`

The Node transform signals (`position`, `x`, `y`, `rotation`, `scale`,
`opacity`) plus:

| Prop        | Type             | Default | Notes                                   |
| ----------- | ---------------- | ------- | --------------------------------------- |
| `z`         | `number`         | `0`     | Depth, positive toward the camera       |
| `rotationX` | `number`         | `0`     | Tilts the top away                      |
| `rotationY` | `number`         | `0`     | Turns the right edge away               |
| `scaleZ`    | `number \| null` | `null`  | Depth scale; `null` follows the x scale |
| `visible`   | `boolean`        | `true`  | Hides the object and its 3D children    |

Methods: `screenPosition()` → `Vector2` in the `Three` node's space (zero until
the runtime has loaded); `object3D()` → the live Three.js object; `opacity3D()`
→ opacity accumulated through 3D ancestors.

### `Mesh3D`

| Prop                | Type                                                                                   | Default      | Notes                                                                 |
| ------------------- | -------------------------------------------------------------------------------------- | ------------ | --------------------------------------------------------------------- |
| `geometry`          | primitive name \| `THREE.BufferGeometry`                                               | `'box'`      | See the primitive list below                                          |
| `size`              | `number \| [w, h] \| [w, h, d]`                                                        | `200`        | Missing dimensions repeat the width; diameter for round shapes        |
| `radius`            | `number`                                                                               | `0`          | Rounded edges for `box`, clamped to half the smallest dimension       |
| `origin`            | `'center' \| 'top' \| 'bottom' \| 'left' \| 'right' \| 'front' \| 'back' \| [x, y, z]` | `'center'`   | Pivot on the shape; tuple in `-1..1`                                  |
| `segments`          | `number`                                                                               | `48`         | Tessellation of curved primitives                                     |
| `material`          | material name \| `THREE.Material`                                                      | `'standard'` | `standard`, `physical`, `phong`, `lambert`, `toon`, `basic`, `normal` |
| `color`             | color                                                                                  | `'#ffffff'`  | Alpha multiplies `opacity`                                            |
| `emissive`          | color                                                                                  | `'#000000'`  | Self-illumination                                                     |
| `emissiveIntensity` | `number`                                                                               | `1`          |                                                                       |
| `metalness`         | `number`                                                                               | `0.1`        | `standard` / `physical` only                                          |
| `roughness`         | `number`                                                                               | `0.55`       | `standard` / `physical` only                                          |
| `wireframe`         | `boolean`                                                                              | `false`      |                                                                       |
| `flatShading`       | `boolean`                                                                              | `false`      |                                                                       |
| `side`              | `'front' \| 'back' \| 'double'`                                                        | `'front'`    | `double` for planes seen from behind                                  |
| `map`               | `string \| null`                                                                       | `null`       | Image URL wrapped around the surface; ignored while hosting content   |
| `contentMaterial`   | material name \| `null`                                                                | `null`       | Shading of the surface content; `null` follows `material`             |
| `contentScale`      | `number \| null`                                                                       | `null`       | Texels per pixel for the content; `null` follows the viewport         |
| `castShadow`        | `boolean`                                                                              | `true`       |                                                                       |
| `receiveShadow`     | `boolean`                                                                              | `true`       |                                                                       |

Methods: `mesh()` → the inner `THREE.Mesh` (geometry, material); `surfaceSize()`
→ the content area in pixels; `hasSurface()`.

Primitives: `box` (with `radius`), `sphere`, `plane`, `circle`, `cylinder`,
`cone`, `torus`, `torusKnot`, `capsule`, `ring`, `icosahedron`, `octahedron`,
`dodecahedron`, `tetrahedron`. `size` meaning per shape: `torus` / `torusKnot`
`[outer diameter, tube diameter]`, `capsule` `[diameter, total length]`, `ring`
`[outer diameter, inner diameter]`, `cylinder` / `cone` `[diameter, height]`.

### `Light3D`

| Prop          | Type                                                              | Default         | Notes                                                   |
| ------------- | ----------------------------------------------------------------- | --------------- | ------------------------------------------------------- |
| `kind`        | `'ambient' \| 'hemisphere' \| 'directional' \| 'point' \| 'spot'` | `'directional'` |                                                         |
| `color`       | color                                                             | `'#ffffff'`     |                                                         |
| `intensity`   | `number`                                                          | `1`             | Sunlight-strength directionals sit around 2–3           |
| `groundColor` | color                                                             | `'#444444'`     | `hemisphere` only                                       |
| `target`      | `[x, y, z]`                                                       | `[0,0,0]`       | `directional` / `spot`; in the same space as `position` |
| `angle`       | `number`                                                          | `30`            | `spot` cone half-angle                                  |
| `penumbra`    | `number`                                                          | `0.3`           | `spot` edge softness, 0–1                               |
| `decay`       | `number`                                                          | `0`             | `point` / `spot` falloff; `2` is physical               |
| `castShadow`  | `boolean`                                                         | `false`         | Needs `shadows` on the `Three` node                     |
| `shadowArea`  | `number`                                                          | `2400`          | `directional`: side of the shadowed square              |

### `Object3D`

| Prop     | Type                        | Default | Notes                                                    |
| -------- | --------------------------- | ------- | -------------------------------------------------------- |
| `object` | `THREE.Object3D \| null`    | `null`  | A ready-made object; replacing it swaps it               |
| `create` | `(three) => THREE.Object3D` |         | Builds the object lazily once the runtime has loaded     |
| `update` | `(object, three) => void`   |         | Signal-tracked; runs before the node applies its opacity |

`raw()` returns the wrapped object. The node's `opacity` multiplies each
material's own opacity; edits made in `update` are respected.

### `Group3D`

Transform only. Use it to rotate or move a set of nodes together.

## Limitations

- A rounded `box` (`radius > 0`) rebuilds its geometry whenever `size` or
  `radius` changes, because the corners must stay spherical. A tween costs a few
  thousand vertices per frame; fine for one bar, noticeable for hundreds.
- Content on non-box primitives replaces the body material, and `map` is ignored
  on any mesh with content.
- Transparent parts of surface content still cast full shadows.
- `absolutePosition()` and the editor overlay of content children are in texel
  space.
- Per-object `opacity` on self-overlapping meshes shows the far side through the
  near side; fade the `Three` node instead.
- One WebGL renderer is shared by all `Three` nodes; its canvas is resized
  whenever consecutive nodes render at different sizes.

## Escape hatches

- `mesh.object3D()` is the holder group with the node's transform and 3D
  children; `mesh.mesh()` is the Three.js mesh inside it. Mutating anything the
  node has no signal for is safe; owned properties are overwritten on every
  sync. `Object3D` nodes expose the wrapped object as `raw()`.
- `stage.sceneObject()`, `stage.cameraObject()`, `stage.rootGroup()`.
- `geometry={myBufferGeometry}` / `material={myMaterial}` on `Mesh3D`.
- `onRender={(renderer, scene, camera) => ...}` on `Three` for post-processing.
- `configureThree({load: () => import(url)})` or `configureThree({module})` to
  control where the runtime comes from; `getSharedRenderer()` /
  `disposeSharedRenderer()` for the WebGL context.
