# @motion-canvas/three

Three.js 3D scenes as Motion Canvas nodes. Every property is a signal, so 3D
objects tween, chain and compose exactly like 2D nodes.

```tsx
import {Three, Mesh3D, Group3D, Light3D} from '@motion-canvas/three';

const stage = createRef<Three>();
const cube = createRef<Mesh3D>();
view.add(
  <Three ref={stage} width={960} height={540} fill="#0f172a" radius={24}
         cameraPitch={20} cameraYaw={-25} shadows>
    <Mesh3D ref={cube} geometry="box" size={220} color="#38bdf8" />
    <Mesh3D geometry="plane" size={[1600, 1600]} rotationX={90} y={110} color="#1f2937" />
    <Txt text="cube" fill="#fff" position={() => cube().screenPosition().addY(-160)} />
  </Three>,
);
yield* all(cube().rotationY(180, 2), stage().cameraYaw(25, 2), cube().color('#f97316', 2));
```

## Conventions

- **Pixels everywhere.** Positions and sizes are in pixels. At the camera
  target plane a `size={200}` box measures the same as a 200 px `Rect`
  (exactly so with `orthographic`). Internally 100 px = 1 Three.js unit, so
  glTF models and light falloff behave like in any Three.js tutorial.
- **Same axes as 2D nodes.** `x` right, `y` down, `z` toward the camera.
  `rotation` is clockwise on screen; `rotationX` tilts the top away;
  `rotationY` turns the right edge away. Degrees.
- **Reused signals.** `position`, `x`, `y`, `rotation`, `scale`, `opacity`
  are the standard Node signals; 3D adds `z`, `rotationX`, `rotationY`,
  `scaleZ`, `visible`.
- **Camera by orbit.** `cameraYaw`, `cameraPitch`, `cameraDistance`,
  `cameraTarget`, `zoom`, `fov` (auto by default), `orthographic`.
- **3D points are `[x, y, z]` tuples** (`cameraTarget`, `Light3D.target`,
  `projectPoint`); node placement is the 2D `position` / `x` / `y` plus `z`.
- **2D on top.** Ordinary 2D children of `<Three>` draw over the 3D image.
  Pin them with `node.screenPosition()` or `stage.projectPoint([x, y, z])`.
- **Lighting just works.** No `Light3D` in the scene → a neutral default rig.
  Add lights to art-direct; `shadows` on `<Three>` plus `castShadow` on a light.
- **Deterministic.** Everything is a pure function of signals; no clocks.

## Which way in? Start with nodes

Three styles share one `<Three>` viewport. Use them in this order:

1. **Nodes (default).** `Mesh3D`, `Group3D`, `Light3D`, the orbit camera
   props and `projectPoint` / `screenPosition()` for labels. One unit system
   (pixels, y down, degrees), every value a signal, deterministic by
   construction. Covers product shots, bar charts, floating primitives,
   isometric layouts.
2. **`Object3D` for one custom shape.** Keep the viewport, camera, lights and
   labels as nodes; wrap only the object that is not a primitive:
   `<Object3D create={three => new three.Mesh(...)} update={obj => ...}>`.
   Inside `create` / `update` you are in Three.js local space (pixels, **y
   up**, radians); the node's props around it stay Motion Canvas (y down,
   degrees). Anchor with `geometry.translate(...)`, place with `x`/`y`/`z`.
3. **Raw scene for existing Three.js code**, imported models with their own
   setup, or post-processing: `<Three scene={scene} camera={camera}>` with
   objects built from `import * as THREE from 'three'`. You own units
   (metres, radians, y up), camera framing, lighting and determinism: every
   mutation must happen inside `onUpdate` (signal-tracked) and derive from
   signals, never from clocks or cached state. The orbit props are ignored
   when `camera` is set (the node warns); `zoom` still applies. Pin labels
   with `stage.projectObject(obj)` or `stage.projectWorld(vector)`.

```tsx
// 3. raw scene
import * as THREE from 'three';
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
camera.position.set(0, 3, 9); camera.lookAt(0, 0, 0);
const knot = new THREE.Mesh(new THREE.TorusKnotGeometry(1.2, 0.4), new THREE.MeshStandardMaterial({color: '#f472b6'}));
scene.add(knot, new THREE.HemisphereLight('#fff', '#334155', 1));
const spin = createSignal(0);
view.add(
  <Three ref={stage} width={1100} height={760} scene={scene} camera={camera}
         onUpdate={() => { knot.rotation.y = toRadians(spin()); }}>
    <Txt text="knot" position={() => stage().projectObject(knot).addY(-200)} />
  </Three>,
);
yield* spin(360, 4);
```

If the scene imports `three` itself, `configureThree({module: THREE})` makes
the nodes reuse that instance instead of importing a second copy.

## Recipes

- **Grow from the floor.** `origin="bottom"` puts the pivot on the base:
  `<Mesh3D geometry="box" origin="bottom" y={floorY} size={() => [80, h(), 80]} />`
  then tween `h`. Label the top with
  `stage.projectPoint([x, floorY - h(), 0])`.
- **Rounded slab / phone / card.** `<Mesh3D geometry="box" radius={24} size={[300, 600, 24]} />`;
  put 2D nodes inside it for the screen (see below).
- **Fog and backdrop.** `fog="#1e1b4b" fogNear={1200} fogFar={3000}` (pixels
  from the camera; defaults are the camera distance and three times it) with
  `background="#1e1b4b"` or the same `fill`.
- **Fade a shot.** Tween the `Three` node's `opacity` — it fades the finished
  image. Per-object `opacity` makes materials transparent, which is right
  for thin or convex shapes but shows the far side of a knot or a model
  through its near side.
- **Custom geometry on a `Mesh3D`.** `geometry={myBufferGeometry}` is used as
  is (author it in pixels, y up); `size`, `radius` and `origin` are ignored
  for it.
- **Escape hatches need the runtime.** `stage.sceneObject()`,
  `mesh.object3D()` and friends throw before Three.js has loaded; call them
  from `onUpdate`, an `Object3D` `update`, or a signal function, not at
  setup.

## 2D content on a surface

Put ordinary 2D nodes inside a `Mesh3D` and they become its surface: a
phone screen, a floating card, a chart on a wall. The children are
rasterized into a texture and mapped onto the mesh, so they get
perspective, occlusion and lighting like any other geometry.

```tsx
<Mesh3D geometry="box" radius={34} size={[320, 660, 22]} contentMaterial="basic">
  <Rect size={[320, 660]} fill={'#0f172a'} radius={34} />
  <Txt y={-270} text="Nova" fontSize={40} fill={'#fff'} />
  <Txt text={() => `${Math.round(progress())} %`} fontSize={48} fill={'#fff'} />
</Mesh3D>
```

- **Coordinates.** The surface is the local space of the children: `(0, 0)`
  is the centre of the face, its edges are at `±width / 2` and
  `±height / 2` of the mesh's `size`. On a `box` (rounded or not) the
  content covers the front face and the other faces keep the body
  material; on every other primitive it wraps the whole surface.
- **Shading.** `contentMaterial="basic"` makes the content glow like a
  screen; the default follows `material`, so a card is lit and shadowed by
  the scene. On a box the content is drawn over the lit body of the front
  face, so transparent areas (a margin around the screen, a rounded edge)
  show the body; on a plane they show what is behind, so a translucent
  panel is just a `Rect` with alpha.
- **Resolution.** Content is rasterized at the resolution the `Three` node
  renders at (on-screen scale times `quality`), so it stays crisp under
  Camera zoom and 2x exports. `contentScale` overrides that per mesh;
  lower it for large surfaces far from the camera. Texture edges are
  capped at 4096 texels.
- **Cost.** The texture is re-drawn and re-uploaded only when a signal the
  content depends on changes. A camera or mesh move is free; a counter
  ticking every frame costs one 2D render of the content plus one upload
  per frame (roughly 5–10 ms for a phone screen under headless
  SwiftShader, invisible on a GPU). A tween of the mesh's own `opacity`
  also re-draws the content, so fade the `Three` node for a cheap fade.
- **What works inside.** Anything that renders on the 2D canvas, including
  `Video`, `Img`, layouts and cached nodes (opacity, filters, shadows).
  2D children of the `Three` node itself are still drawn as a crisp
  overlay on top of the image, as before.

## Nodes

| Node | What it is | Key props |
|------|------------|-----------|
| `Three` | The viewport (a `Rect`) | camera props, `shadows`, `fog`, `background`, `quality`, `defaultLights`, `scene`, `camera`, `onUpdate`, `onRender` |
| `Mesh3D` | A primitive solid; 2D children become its surface | `geometry`, `size`, `origin`, `radius`, `color`, `material`, `metalness`, `roughness`, `emissive`, `wireframe`, `flatShading`, `map`, `side`, `contentMaterial`, `contentScale` |
| `Group3D` | Empty transform node | transform signals only |
| `Object3D` | Any Three.js object as a node | `object`, `create`, `update` |
| `Light3D` | A light | `kind`, `color`, `intensity`, `target`, `castShadow`, `angle`, `penumbra`, `decay` |

Primitives: `box` (with `radius` for rounded edges), `sphere`, `plane`,
`circle`, `cylinder`, `cone`, `torus`, `torusKnot`, `capsule`, `ring`,
`icosahedron`, `octahedron`, `dodecahedron`, `tetrahedron`.
Materials: `standard` (default), `physical`, `phong`, `lambert`, `toon`,
`basic` (unlit), `normal`.

## Runtime loading

Three.js is not bundled into this package. It is `import('three')`-ed on first
render, so bundlers split it into a chunk that only loads for scenes that use
3D. Rendering waits for the load the same way it waits for images. Override
the source with `configureThree({load: () => import(url)})`.

One shared `WebGLRenderer` serves every `Three` node.

## Escape hatches

- `mesh.object3D()` — the live Three.js object (safe to mutate anything the
  node has no signal for). `Object3D` nodes expose the wrapped object as
  `raw()`.
- `stage.sceneObject()`, `stage.cameraObject()`, `stage.rootGroup()`.
- `geometry={myBufferGeometry}` / `material={myMaterial}` on `Mesh3D`.
- `onRender={(renderer, scene, camera) => ...}` on `Three` for post-processing.

## Testing

`render_scene_test/src/scenes/Three3DTest.tsx` is the node-mode smoke scene,
`Three3DRaw.tsx` covers the raw scene/camera props and `Object3D`;
`render_scene_test/bench3d.mjs` times frames under the engine's headless
Chromium flags (SwiftShader).
