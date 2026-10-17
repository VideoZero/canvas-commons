import {Circle, Img, Txt, makeScene2D} from '@canvas-commons/2d';
import {createSignal, waitFor} from '@canvas-commons/core';
import photo from '../assets/photo.png';
import {Colors, Mono, Sans, caption, from2d, intro} from '../shared/ui';

interface Attribution {
  text: string;
}

const Credit = encodeURIComponent(
  JSON.stringify({text: 'Photo: Jane Doe / Example Stock (CC BY 4.0)'}),
);

export default makeScene2D(function* (view) {
  yield* intro(
    view,
    'attribution',
    'Img/Video draw the credit from the attribution query parameter of their source and list it via getAttributions().',
  );
  caption(view, '<Img src="photo.png?attribution={text: …}"/>');
  const getAttributions = from2d<() => Attribution[]>('getAttributions');
  const listed = createSignal('');
  const img = (
    <Img
      src={`${photo}?attribution=${Credit}`}
      width={560}
      y={-20}
      radius={14}
    />
  ) as Img;
  view.add(img);
  view.add(
    <Txt
      y={190}
      fontFamily={Mono}
      fontSize={18}
      fill={getAttributions ? Colors.green : Colors.red}
      text={() =>
        getAttributions
          ? `getAttributions(): ${listed() || '…'}`
          : 'getAttributions(): not available on canvas-commons main'
      }
    />,
  );
  view.add(
    <Txt
      y={225}
      fontFamily={Sans}
      fontSize={18}
      fill={Colors.muted}
      text="Expected: the credit is drawn in the corner of the image"
    />,
  );
  yield img;
  yield* waitFor(0.5);
  if (getAttributions) {
    listed(
      getAttributions()
        .map(a => a.text)
        .join(' · '),
    );
  }
  // Point at the bottom-left corner, where the credit is drawn.
  const marker = (
    <Circle
      x={-200}
      y={140}
      size={150}
      stroke={Colors.yellow}
      lineWidth={4}
      end={0}
    />
  ) as Circle;
  view.add(marker);
  yield* marker.end(1, 0.8);
  yield* waitFor(3);
  yield* waitFor(0.5);
});
