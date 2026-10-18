import {Node, Rect, Txt, makeScene2D} from '@canvas-commons/2d';
import {ThreadGenerator, all, waitFor} from '@canvas-commons/core';
import {
  Colors,
  NodeClass,
  Sans,
  caption,
  intro,
  loadOptional,
  placeholder,
} from '../shared/ui';

type Signal = (
  value: unknown,
  duration: number,
) => ThreadGenerator & {to: Signal};
type Stage = Node & {cameraYaw: Signal; cameraPitch: Signal};
type Mesh = Node & {rotationY: Signal; color: Signal};

export default makeScene2D(function* (view) {
  yield* intro(
    view,
    'three',
    '@canvas-commons/three: Three.js scenes as nodes — orbit camera, lights, shadows; 2D children drawn on mesh surfaces.',
    'package',
  );
  caption(
    view,
    '<Three> + Mesh3D/Light3D; the card face is a 2D Rect+Txt',
    -245,
  );
  const three = (yield loadOptional(
    () => import('@canvas-commons/three'),
  )) as Record<string, unknown>;
  const Three = three.Three as NodeClass<Stage> | undefined;
  const Mesh3D = three.Mesh3D as NodeClass<Mesh> | undefined;
  const Light3D = three.Light3D as NodeClass | undefined;
  if (!Three || !Mesh3D || !Light3D) {
    placeholder(
      view,
      "import {Three, Mesh3D, Light3D} from '@canvas-commons/three'",
    );
    yield* waitFor(6);
    return;
  }

  const card = new Mesh3D({
    geometry: 'box',
    size: [360, 220, 30],
    radius: 16,
    color: '#1b2230',
    y: -40,
    children: (
      <Rect
        width={360}
        height={220}
        fill={Colors.accent}
        layout
        direction="column"
        justifyContent="center"
        alignItems="center"
        gap={6}
      >
        <Txt
          text="2D on 3D"
          fontFamily={Sans}
          fontWeight={800}
          fontSize={52}
          fill={Colors.background}
        />
        <Txt
          text="Rect + Txt children of a Mesh3D"
          fontFamily={Sans}
          fontSize={20}
          fill={Colors.background}
        />
      </Rect>
    ),
  });
  const sphere = new Mesh3D({
    geometry: 'sphere',
    size: 120,
    x: 300,
    y: 10,
    color: Colors.orange,
    metalness: 0.2,
    roughness: 0.35,
  });
  const torus = new Mesh3D({
    geometry: 'torus',
    size: 130,
    x: -310,
    y: 10,
    color: Colors.green,
  });
  const stage = new Three({
    width: 900,
    height: 440,
    y: 10,
    radius: 20,
    fill: '#0b1220',
    cameraPitch: 18,
    cameraYaw: -25,
    shadows: true,
    children: [
      new Light3D({kind: 'hemisphere', intensity: 0.8}),
      new Light3D({
        kind: 'directional',
        position: [-400, -600],
        z: 700,
        intensity: 2.5,
        castShadow: true,
      }),
      card,
      sphere,
      torus,
      new Mesh3D({
        geometry: 'plane',
        size: [2000, 2000],
        rotationX: 90,
        y: 150,
        color: '#1f2937',
        receiveShadow: true,
      }),
    ],
  });
  view.add(stage);
  yield* all(
    stage.cameraYaw(25, 4),
    card.rotationY(-20, 2).to(20, 2),
    torus.rotationY(360, 4),
    sphere.color(Colors.purple, 4),
  );
  yield* stage.cameraPitch(35, 1.5);
  yield* waitFor(0.5);
});
