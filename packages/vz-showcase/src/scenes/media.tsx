import {Img, Rect, Txt, makeScene2D} from '@canvas-commons/2d';
import {waitFor} from '@canvas-commons/core';
import photo from '../assets/photo.png';
import {Colors, Mono, Sans, caption, intro, logPanel} from '../shared/ui';

export default makeScene2D(function* (view) {
  yield* intro(
    view,
    'media',
    'Images and videos that fail to load no longer fail the scene: they draw blank and log a warning.',
    'fix',
  );
  caption(
    view,
    'Two images — the right one points at a file that does not exist',
  );
  logPanel(view, {y: 185});
  view.add(
    <>
      <Img src={photo} x={-220} y={-50} width={360} radius={12} />
      <Rect
        x={220}
        y={-50}
        width={360}
        height={225}
        radius={12}
        stroke={Colors.panelLight}
        lineWidth={3}
        lineDash={[10, 8]}
      />
      <Txt
        x={-220}
        y={90}
        text="photo.png"
        fontFamily={Mono}
        fontSize={18}
        fill={Colors.muted}
      />
      <Txt
        x={220}
        y={90}
        text="missing-image.png (404)"
        fontFamily={Mono}
        fontSize={18}
        fill={Colors.muted}
      />
    </>,
  );
  yield* waitFor(1);
  view.add(
    <Img
      src="/missing-image.png"
      x={220}
      y={-50}
      width={360}
      height={225}
      radius={12}
    />,
  );
  view.add(
    <Txt
      y={125}
      fontFamily={Sans}
      fontSize={20}
      fill={Colors.text}
      text="Expected: the scene keeps playing with a blank image and a logged warning"
    />,
  );
  yield* waitFor(4);
});
