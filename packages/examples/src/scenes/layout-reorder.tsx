import {Layout, Rect, makeScene2D} from '@canvas-commons/2d';
import {createRef, waitFor} from '@canvas-commons/core';

const COLORS = ['#ff6470', '#ffc66d', '#99c47a', '#68abdf', '#b58fc2'];

export default makeScene2D(function* (view) {
  const row = createRef<Layout>();

  view.add(
    <Rect
      layout
      padding={24}
      radius={16}
      fill={'#1c1c22'}
      stroke={'#ffffff22'}
      lineWidth={2}
    >
      <Layout ref={row} layout direction="row" gap={20}>
        {COLORS.map(color => (
          <Rect width={100} height={100} fill={color} radius={12} />
        ))}
      </Layout>
    </Rect>,
  );

  yield* waitFor(0.3);
  yield* row().reorder([...row().children()].reverse(), 0.6);
  yield* waitFor(0.3);

  const [first, ...rest] = row().children();
  yield* row().reorder([...rest, first], 0.6);
  yield* waitFor(0.3);
});
