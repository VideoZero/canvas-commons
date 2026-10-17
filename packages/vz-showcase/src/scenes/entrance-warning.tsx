import {Node, Rect, Txt, makeScene2D} from '@canvas-commons/2d';
import {waitFor} from '@canvas-commons/core';
import {Colors, Mono, Sans, caption, intro, logPanel} from '../shared/ui';

export default makeScene2D(function* (view) {
  yield* intro(
    view,
    'entrance-warning',
    'Node.warnVisibleBeforeEntrance warns when a node that has been on screen for a while starts its fade-in.',
  );
  const NodeFlags = Node as unknown as {warnVisibleBeforeEntrance?: boolean};
  const supported = 'warnVisibleBeforeEntrance' in NodeFlags;
  if (supported) NodeFlags.warnVisibleBeforeEntrance = true;
  caption(
    view,
    `Node.warnVisibleBeforeEntrance = true ${supported ? '' : '(missing on main)'} — a card that forgot opacity={0}`,
  );
  logPanel(view, {y: 175});
  const card = (
    <Rect
      y={-60}
      width={420}
      height={150}
      radius={18}
      fill={Colors.accent}
      layout
      justifyContent="center"
      alignItems="center"
    >
      <Txt
        text="already visible"
        fontFamily={Sans}
        fontWeight={700}
        fontSize={34}
        fill={Colors.background}
      />
    </Rect>
  ) as Rect;
  view.add(card);
  view.add(
    <Txt
      y={60}
      fontFamily={Mono}
      fontSize={18}
      fill={Colors.muted}
      text={
        'view.add(<Rect …/>); yield* waitFor(1.5); yield* card.opacity(1, 0.8);'
      }
    />,
  );
  yield* waitFor(1.5);
  yield* card.opacity(1, 0.8);
  yield* waitFor(3.5);
  if (supported) NodeFlags.warnVisibleBeforeEntrance = false;
});
