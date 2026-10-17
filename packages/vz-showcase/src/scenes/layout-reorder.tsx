import {Layout, Node, Rect, Txt, makeScene2D} from '@canvas-commons/2d';
import {ThreadGenerator, createRef, waitFor} from '@canvas-commons/core';
import {Colors, Sans, caption, intro, placeholder} from '../shared/ui';

type Reorder = (order: Node[], duration?: number) => ThreadGenerator | Layout;

const Fills = [
  Colors.accent,
  Colors.orange,
  Colors.green,
  Colors.purple,
  Colors.yellow,
];

export default makeScene2D(function* (view) {
  yield* intro(
    view,
    'layout-reorder',
    'Layout.reorder(order, duration?, timing?) rearranges children and slides each into its new slot.',
  );
  caption(view, 'row.reorder(newOrder, 1) on a flex row');

  const row = createRef<Layout>();
  view.add(
    <Rect
      ref={row}
      layout
      direction="row"
      gap={18}
      padding={18}
      radius={18}
      fill={Colors.panel}
      y={-30}
    >
      {['A', 'B', 'C', 'D', 'E'].map((letter, i) => (
        <Rect
          width={120}
          height={120}
          radius={14}
          fill={Fills[i]}
          layout
          justifyContent="center"
          alignItems="center"
        >
          <Txt
            text={letter}
            fontFamily={Sans}
            fontSize={56}
            fontWeight={800}
            fill={Colors.background}
          />
        </Rect>
      ))}
    </Rect>,
  );
  yield* waitFor(0.5);

  const reorder = (row() as unknown as {reorder?: Reorder}).reorder;
  if (!reorder) {
    placeholder(view, 'Layout.reorder(order, duration, timing)', {y: 170});
    yield* waitFor(5);
    return;
  }

  const status = (
    <Txt y={150} fontFamily={Sans} fontSize={24} fill={Colors.text} />
  ) as Txt;
  view.add(status);
  const kids = () => [...row().children()];
  const orders = [
    {name: 'reverse', pick: (k: Node[]) => [...k].reverse()},
    {name: 'rotate left', pick: (k: Node[]) => [...k.slice(1), k[0]]},
    {name: 'shuffle', pick: (k: Node[]) => [k[2], k[0], k[4], k[1], k[3]]},
    {
      name: 'sorted',
      pick: (k: Node[]) =>
        [...k].sort((a, b) =>
          (a.children()[0] as Txt)
            .text()
            .localeCompare((b.children()[0] as Txt).text()),
        ),
    },
  ];
  for (const order of orders) {
    status.text(`reorder: ${order.name}`);
    const result = reorder.call(row(), order.pick(kids()), 1);
    if (result && typeof (result as ThreadGenerator).next === 'function') {
      yield* result as ThreadGenerator;
    }
    yield* waitFor(0.5);
  }
  yield* waitFor(0.5);
});
