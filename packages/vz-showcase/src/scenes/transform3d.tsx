import {Node, Rect, Txt, makeScene2D} from '@canvas-commons/2d';
import {ThreadGenerator, all, waitFor} from '@canvas-commons/core';
import {
  Colors,
  NodeClass,
  Sans,
  caption,
  from2d,
  intro,
  placeholder,
} from '../shared/ui';

type Tilt = Node & {
  rotationX: (value: number, duration: number) => ThreadGenerator;
  rotationY: (value: number, duration: number) => ThreadGenerator;
};

function card() {
  return (
    <Rect
      width={420}
      height={250}
      radius={22}
      fill={Colors.accent}
      layout
      direction="column"
      justifyContent="center"
      alignItems="center"
      gap={8}
    >
      <Txt
        text="Transform3D"
        fontFamily={Sans}
        fontWeight={800}
        fontSize={44}
        fill={Colors.background}
      />
      <Txt
        text="perspective · depth · shadow"
        fontFamily={Sans}
        fontSize={22}
        fill={Colors.background}
      />
    </Rect>
  );
}

export default makeScene2D(function* (view) {
  yield* intro(
    view,
    'transform3d',
    'Transform3D tilts its children with a perspective 3D transform, optionally extruded into a shaded slab with a shadow.',
  );
  caption(
    view,
    '<Transform3D perspective depth shadowOpacity> around a 2D card',
  );
  const Transform3D = from2d<NodeClass<Tilt>>('Transform3D');
  if (!Transform3D) {
    view.add(<Rect y={-20}>{card()}</Rect>);
    placeholder(
      view,
      '<Transform3D rotationX rotationY perspective depth shadowOpacity>',
      {y: 170, height: 110},
    );
    yield* waitFor(6);
    return;
  }
  const tilt = new Transform3D({
    y: -10,
    perspective: 900,
    depth: 24,
    depthSteps: 12,
    shadowOpacity: 0.5,
    children: card(),
  });
  view.add(tilt);
  yield* waitFor(0.4);
  yield* all(tilt.rotationY(35, 1.2), tilt.rotationX(20, 1.2));
  yield* all(tilt.rotationY(-35, 1.6), tilt.rotationX(-15, 1.6));
  yield* all(tilt.rotationY(0, 1.2), tilt.rotationX(0, 1.2));
  yield* waitFor(0.6);
});
