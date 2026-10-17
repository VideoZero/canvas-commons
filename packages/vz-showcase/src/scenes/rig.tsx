import {Line, Node, Txt, makeScene2D} from '@canvas-commons/2d';
import {createSignal, linear, waitFor} from '@canvas-commons/core';
import {
  Colors,
  Sans,
  caption,
  intro,
  loadOptional,
  placeholder,
} from '../shared/ui';

const Figure: Record<string, [number, number]> = {
  root: [0, 0],
  neck: [0, -100],
  headCenter: [0, -130],
  leftShoulder: [-20, -95],
  leftElbow: [-30, -50],
  leftWrist: [-35, -5],
  rightShoulder: [20, -95],
  rightElbow: [30, -50],
  rightWrist: [35, -5],
  leftHip: [-12, 0],
  leftKnee: [-12, 60],
  leftAnkle: [-12, 120],
  leftToe: [8, 120],
  rightHip: [12, 0],
  rightKnee: [12, 60],
  rightAnkle: [12, 120],
  rightToe: [32, 120],
};

type RigInstance = {node: Node};
type PoseFn = (t: number) => unknown;

export default makeScene2D(function* (view) {
  yield* intro(
    view,
    'rig',
    '@canvas-commons/rig: 2D rigging from annotated SVGs, FABRIK IK, biped/quadruped templates, walk/run/idle clips.',
    'package',
  );
  caption(
    view,
    'A biped stick figure driven by locomotion(): idle → walk → run → brake',
    -235,
  );
  const rig = (yield loadOptional(
    () => import('@canvas-commons/rig'),
  )) as Record<string, unknown>;
  const Rig = rig.Rig as
    | (new (
        char: unknown,
        template: unknown,
        options: Record<string, unknown>,
      ) => RigInstance)
    | undefined;
  const syntheticChar = rig.syntheticChar as
    | ((points: Record<string, [number, number]>, box: number[]) => unknown)
    | undefined;
  const bindPose = rig.bindPose as
    ((rig: RigInstance, clock: () => number, pose: PoseFn) => void) | undefined;
  const locomotion = rig.locomotion as
    | ((rig: RigInstance, options: Record<string, unknown>) => PoseFn)
    | undefined;
  if (!Rig || !syntheticChar || !bindPose || !locomotion) {
    placeholder(
      view,
      "import {Rig, BIPED, bindPose, locomotion} from '@canvas-commons/rig'",
    );
    yield* waitFor(6);
    return;
  }
  view.add(
    <Line
      points={[
        [-480, 150],
        [480, 150],
      ]}
      stroke={Colors.panelLight}
      lineWidth={4}
    />,
  );
  const figure = new Rig(
    syntheticChar(Figure, [-100, -160, 200, 300]),
    rig.BIPED,
    {render: 'bones', color: Colors.accent, scale: 0.9},
  );
  view.add(figure.node);
  const clock = createSignal(0);
  bindPose(
    figure,
    clock,
    locomotion(figure, {
      groundY: 150,
      startX: -380,
      speed: [
        {t: 0, speed: 0},
        {t: 0.8, speed: 0},
        {t: 1.7, speed: 110},
        {t: 3.2, speed: 110},
        {t: 4.0, speed: 240},
        {t: 5.2, speed: 240},
        {t: 5.9, speed: 0},
      ],
    }),
  );
  view.add(
    <Txt
      y={200}
      fontFamily={Sans}
      fontSize={20}
      fill={Colors.muted}
      text={() => `t = ${clock().toFixed(1)} s`}
    />,
  );
  yield* clock(7, 7, linear);
});
