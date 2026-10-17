import {Txt, makeScene2D} from '@canvas-commons/2d';
import {all, waitFor} from '@canvas-commons/core';
import {Colors, Mono, Sans, caption, intro} from '../shared/ui';

export default makeScene2D(function* (view) {
  yield* intro(
    view,
    'text-fix-regressions',
    'Tests only: pins how spaced and right-to-left text paints when split. No behaviour change expected.',
    'tests',
  );
  caption(
    view,
    'Txt.split() pieces recoloured one by one — letterSpacing, a ligature and RTL text',
  );

  const rows: [string, Record<string, unknown>][] = [
    ['S P A C E D', {letterSpacing: 12}],
    ['office affine', {}],
    ['مرحبا بالعالم', {}],
  ];
  const texts: Txt[] = [];
  for (const [i, [text, props]] of rows.entries()) {
    const txt = (
      <Txt
        y={-120 + i * 110}
        text={text}
        fontFamily={Sans}
        fontSize={60}
        fontWeight={700}
        fill={Colors.text}
        {...props}
      />
    ) as Txt;
    view.add(txt);
    texts.push(txt);
  }
  view.add(
    <Txt
      y={215}
      fontFamily={Mono}
      fontSize={18}
      fill={Colors.muted}
      text="Both sides should look identical."
    />,
  );
  yield* waitFor(1);
  for (const txt of texts) {
    const pieces = txt.split('grapheme');
    yield* all(
      ...pieces.map((piece, i) =>
        piece.fill(i % 2 ? Colors.accent : Colors.green, 0.4),
      ),
    );
  }
  yield* waitFor(3);
});
