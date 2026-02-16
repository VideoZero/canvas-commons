import {Layout, Rect, Txt, makeScene2D} from '@motion-canvas/2d';
import {createRef, easeInOutCubic, waitFor} from '@motion-canvas/core';

const Colors = ['#e13238', '#e8a631', '#41a663', '#3b82f6', '#a855f7'];

function card(text: string, color: string) {
  return (
    <Rect
      size={100}
      radius={12}
      fill={color}
      layout
      alignItems={'center'}
      justifyContent={'center'}
    >
      <Txt
        text={text}
        fill={'#fff'}
        fontSize={36}
        fontWeight={700}
        fontFamily={'monospace'}
      />
    </Rect>
  );
}

export default makeScene2D(function* (view) {
  const row = createRef<Layout>();

  view.add(
    <Layout
      ref={row}
      layout
      direction={'row'}
      gap={20}
      alignItems={'center'}
      justifyContent={'center'}
    >
      {card('A', Colors[0])}
      {card('B', Colors[1])}
      {card('C', Colors[2])}
    </Layout>,
  );

  yield* waitFor(0.4);

  // Add items
  yield* row().addAnimated(card('D', Colors[3]), 0.5);
  yield* row().addAnimated(card('E', Colors[4]), 0.5);

  yield* waitFor(0.4);

  // Reorder: reverse
  const children = row().children();
  yield* row().reorderAnimated([...children].reverse(), 0.6, easeInOutCubic);

  yield* waitFor(0.4);

  // Remove from middle
  yield* row().removeAnimated(row().children()[2] as Layout, 0.5);

  yield* waitFor(0.4);

  // Switch to column with FLIP
  const flip = row().recordFlipState();
  row().direction('column');
  yield* row().tweenFlip(flip, 0.7);

  yield* waitFor(0.4);

  // Switch back to row
  const flip2 = row().recordFlipState();
  row().direction('row');
  yield* row().tweenFlip(flip2, 0.7);

  yield* waitFor(0.5);
});
