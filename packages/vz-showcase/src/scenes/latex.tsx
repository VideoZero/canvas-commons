import {Latex, Rect, Txt, makeScene2D} from '@canvas-commons/2d';
import {BBox, all, createRef, waitFor} from '@canvas-commons/core';
import {Colors, Mono, Sans, caption, intro} from '../shared/ui';

type FragmentBox = (id: string, padding?: number) => BBox[];

export default makeScene2D(function* (view) {
  yield* intro(
    view,
    'latex',
    'Brace-balanced {{}} fragments, fragment shape/bbox queries, size tweens in map(), eagerValidation.',
    'fix',
  );
  caption(
    view,
    String.raw`tex="{{\frac{a}{b}}} = {{c}}"  — then tween to add "+ {{d}}"`,
  );
  const source = (
    <Txt
      y={-180}
      fontFamily={Mono}
      fontSize={20}
      fill={Colors.muted}
      text={String.raw`{{\frac{a}{b}}} is one fragment (CC main cuts it at the first }})`}
    />
  ) as Txt;
  view.add(source);

  const tex = createRef<Latex>();
  const box = createRef<Rect>();
  view.add(
    <>
      <Rect
        ref={box}
        stroke={Colors.orange}
        lineWidth={3}
        radius={8}
        lineDash={[8, 6]}
        opacity={0}
      />
      <Latex
        ref={tex}
        tex={String.raw`{{\frac{a}{b}}} = {{c}}`}
        fill={Colors.text}
        height={150}
      />
    </>,
  );
  const status = (
    <Txt y={190} fontFamily={Sans} fontSize={22} fill={Colors.text} />
  ) as Txt;
  view.add(status);

  yield* waitFor(0.6);
  const getBox = (tex() as unknown as {getFragmentBBox?: FragmentBox})
    .getFragmentBBox;
  if (getBox) {
    const id = String.raw`\frac{a}{b}`;
    status.text('getFragmentBBox("\\frac{a}{b}", 10) — highlighted');
    box().position(() => getBox.call(tex(), id, 10)[0]?.center ?? [0, 0]);
    box().size(() => getBox.call(tex(), id, 10)[0]?.size ?? [0, 0]);
    yield* box().opacity(1, 0.4);
  } else {
    status.text('getFragmentBBox: not available on canvas-commons main');
  }
  yield* waitFor(1);
  status.text('tex(...) tween with an explicit height keeps the size');
  yield* tex().tex(String.raw`{{\frac{a}{b}}} = {{c}} + {{d}}`, 1.2);
  yield* waitFor(0.6);
  status.text('and back — the highlight follows the fragment');
  yield* all(tex().tex(String.raw`{{\frac{a}{b}}} = {{c}}`, 1.2));
  yield* waitFor(1.2);
});
