import {Txt, makeScene2D} from '@canvas-commons/2d';
import {waitFor} from '@canvas-commons/core';
import {Colors, Sans, caption, intro} from '../shared/ui';

export default makeScene2D(function* (view) {
  yield* intro(
    view,
    'ffmpeg',
    'The FFmpeg exporter sends frames in order and waits for the last one before ending the export.',
    'fix',
  );
  caption(view, 'Exporter-only fix in @canvas-commons/ffmpeg');
  view.add(
    <Txt
      width={760}
      textWrap
      textAlign="center"
      fontFamily={Sans}
      fontSize={26}
      lineHeight={'140%'}
      fill={Colors.text}
      text={
        'Nothing to see in the scene itself: frames arriving out of order or ' +
        'the last frame being dropped only show up when exporting through the ' +
        'FFmpeg exporter. These videos are rendered with the image-sequence ' +
        'exporter, so both sides look the same.'
      }
    />,
  );
  yield* waitFor(4);
});
