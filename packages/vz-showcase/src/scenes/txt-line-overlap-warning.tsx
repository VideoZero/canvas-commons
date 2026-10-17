import {Txt, makeScene2D} from '@canvas-commons/2d';
import {waitFor} from '@canvas-commons/core';
import {Colors, Mono, Sans, caption, intro, logPanel} from '../shared/ui';

export default makeScene2D(function* (view) {
  yield* intro(
    view,
    'txt-line-overlap-warning',
    'Txt.warnTightLineHeight warns when lines overlap, e.g. lineHeight={1.2} meant as a multiplier but read as pixels.',
  );
  const TxtFlags = Txt as unknown as {warnTightLineHeight?: boolean};
  const supported = 'warnTightLineHeight' in TxtFlags;
  if (supported) TxtFlags.warnTightLineHeight = true;
  caption(
    view,
    `Txt.warnTightLineHeight = true ${supported ? '' : '(missing on main)'} — text with lineHeight={1.2}`,
  );
  logPanel(view, {y: 175});
  yield* waitFor(0.6);
  const text = (
    <Txt
      y={-60}
      width={700}
      textWrap
      textAlign="center"
      lineHeight={1.2}
      fontFamily={Sans}
      fontWeight={700}
      fontSize={44}
      fill={Colors.text}
      opacity={0}
      text="Three lines of text squeezed onto each other by a pixel line height"
    />
  ) as Txt;
  view.add(text);
  view.add(
    <Txt
      y={40}
      fontFamily={Mono}
      fontSize={18}
      fill={Colors.muted}
      text={'<Txt lineHeight={1.2} fontSize={44} … />'}
    />,
  );
  yield* text.opacity(1, 0.5);
  yield* waitFor(4);
  if (supported) TxtFlags.warnTightLineHeight = false;
});
