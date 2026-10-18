import {Layout, Rect, Txt, makeScene2D} from '@canvas-commons/2d';
import {all, createRef, waitFor} from '@canvas-commons/core';
import {Colors, Sans, caption, intro} from '../shared/ui';

const Fills = [Colors.accent, Colors.orange, Colors.green, Colors.purple];

function card(i: number, ref?: ReturnType<typeof createRef<Layout>>) {
  return (
    <Rect
      ref={ref}
      basis={0}
      grow={1}
      height={110}
      radius={12}
      fill={Fills[i % Fills.length]}
      layout
      justifyContent="center"
      alignItems="center"
    >
      <Txt
        text={`basis 0 · ${i + 1}`}
        fontFamily={Sans}
        fontSize={20}
        fontWeight={700}
        fill={Colors.background}
      />
    </Rect>
  ) as Rect;
}

export default makeScene2D(function* (view) {
  yield* intro(
    view,
    'layout-flip-fixes',
    'Animated add/remove/editLayout keep grown, stretched and basis-0 flex children sized; thawLayout animates.',
    'fix',
  );
  caption(
    view,
    'Row of grow={1} basis={0} cards — remove(1s), add(1s), editLayout(gap)',
  );

  const row = createRef<Layout>();
  const middle = createRef<Layout>();
  view.add(
    <Rect
      ref={row}
      layout
      direction="row"
      gap={16}
      padding={16}
      width={820}
      height={142}
      radius={18}
      fill={Colors.panel}
      y={-40}
    >
      {card(0)}
      {card(1, middle)}
      {card(2)}
    </Rect>,
  );
  const status = (
    <Txt
      y={110}
      fontFamily={Sans}
      fontSize={22}
      fill={Colors.text}
      text="three cards, each 1/3 wide"
    />
  ) as Txt;
  view.add(status);
  yield* waitFor(0.6);

  status.text('middle.remove(1.2) — siblings should widen smoothly');
  yield* middle().remove(1.2);
  yield* waitFor(0.4);

  status.text('row.add(card, 1.2) — siblings should shrink smoothly');
  yield* row().add(card(3), 1.2);
  yield* waitFor(0.4);

  status.text('row.editLayout(1.2, gap 60) — cards keep their flex size');
  yield* all(row().editLayout(1.2, n => n.gap(60)));
  yield* waitFor(0.4);

  status.text('freezeLayout, scatter, thawLayout(1.2) — slide back into flex');
  row().remove();
  const squares = createRef<Layout>();
  view.add(
    <Rect
      ref={squares}
      layout
      direction="row"
      gap={24}
      padding={16}
      radius={18}
      fill={Colors.panel}
      y={-40}
    >
      {[0, 1, 2, 3, 4].map(i => (
        <Rect
          width={110}
          height={110}
          radius={12}
          fill={Fills[i % Fills.length]}
          rotation={i * 8}
        />
      ))}
    </Rect>,
  );
  yield* waitFor(0.3);
  squares().freezeLayout();
  yield* all(
    ...squares()
      .children()
      .map((child, i) =>
        child.position(
          child.position().add([i * 30 - 60, i % 2 ? 90 : -90]),
          0.5,
        ),
      ),
  );
  yield* waitFor(0.3);
  yield* squares().thawLayout(1.2);
  yield* waitFor(0.8);
});
