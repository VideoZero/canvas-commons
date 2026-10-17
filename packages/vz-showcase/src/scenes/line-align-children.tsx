import {Circle, Line, Rect, Txt, makeScene2D} from '@canvas-commons/2d';
import {Vector2, createRef, createSignal, waitFor} from '@canvas-commons/core';
import {Colors, Sans, caption, intro} from '../shared/ui';

export default makeScene2D(function* (view) {
  yield* intro(
    view,
    'line-align-children',
    'Curve.alignChildren places children (e.g. a label) at the midpoint along the tangent; uprightRotation() keeps it readable.',
  );
  caption(
    view,
    '<Line alignChildren> with a label child that should ride its midpoint',
  );

  const line = createRef<Line>();
  const angle = createSignal(-20);
  const end = () => Vector2.fromDegrees(angle()).scale(330).add([-250, 60]);
  view.add(
    <>
      <Circle size={16} fill={Colors.muted} position={[0, 0]} />
      <Txt
        y={22}
        text="line origin"
        fontFamily={Sans}
        fontSize={14}
        fill={Colors.muted}
      />
      <Line
        ref={line}
        points={() => [[-250, 60], end()]}
        stroke={Colors.accent}
        lineWidth={8}
        endArrow
        arrowSize={18}
        {...{alignChildren: true}}
      >
        <Rect
          y={-34}
          layout
          padding={[6, 14]}
          radius={8}
          fill={Colors.orange}
          rotation={() => {
            const upright = (
              line() as unknown as {uprightRotation?: () => number}
            ).uprightRotation;
            return upright ? upright.call(line()) : 0;
          }}
        >
          <Txt
            text="label"
            fontFamily={Sans}
            fontWeight={700}
            fontSize={24}
            fill={Colors.background}
          />
        </Rect>
      </Line>
    </>,
  );
  const supported = 'alignChildren' in line();
  view.add(
    <Txt
      y={210}
      fontFamily={Sans}
      fontSize={22}
      fill={supported ? Colors.green : Colors.red}
      text={
        supported
          ? 'alignChildren + uprightRotation(): label follows the midpoint and never reads upside down'
          : 'alignChildren is not available on canvas-commons main — the label stays at the origin'
      }
    />,
  );
  yield* waitFor(0.5);
  yield* angle(-160, 3).to(-20, 2.5);
  yield* waitFor(0.8);
});
