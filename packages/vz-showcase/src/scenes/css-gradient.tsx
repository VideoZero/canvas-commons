import {Rect, SVG, Txt, makeScene2D} from '@canvas-commons/2d';
import {all, waitFor} from '@canvas-commons/core';
import {
  Colors,
  Mono,
  Sans,
  caption,
  from2d,
  intro,
  placeholder,
} from '../shared/ui';

const Gradients = [
  'linear-gradient(to right, #58a6ff, #bc8cff)',
  'radial-gradient(circle, #e3b341, #f85149)',
  'conic-gradient(from 90deg, #3fb950, #58a6ff, #f0883e, #3fb950)',
];

const WithGradient = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 120">
  <defs>
    <linearGradient id="g" x1="0" x2="1" y1="0" y2="0">
      <stop offset="0" stop-color="#f0883e"/>
      <stop offset="1" stop-color="#bc8cff"/>
    </linearGradient>
    <radialGradient id="r">
      <stop offset="0" stop-color="#ffffff"/>
      <stop offset="1" stop-color="#58a6ff"/>
    </radialGradient>
  </defs>
  <rect x="5" y="10" width="170" height="100" rx="20" fill="url(#g)"/>
  <circle cx="240" cy="60" r="50" fill="url(#r)"/>
</svg>`;

export default makeScene2D(function* (view) {
  yield* intro(
    view,
    'css-gradient',
    'CSS gradients as fill/stroke (linear, radial, conic), tweens between colours and gradients, SVG <linearGradient>.',
  );
  caption(
    view,
    'fill="linear-gradient(…)" | "radial-gradient(…)" | "conic-gradient(…)"',
  );
  const supported = !!from2d('parseCSSGradient');
  const rects = Gradients.map((_, i) => (
    <Rect
      x={(i - 1) * 270}
      y={-110}
      width={230}
      height={150}
      radius={20}
      fill={Colors.panelLight}
    />
  )) as Rect[];
  view.add(rects);
  view.add(
    Gradients.map((g, i) => (
      <Txt
        x={(i - 1) * 270}
        y={-10}
        width={240}
        textWrap
        textAlign="center"
        text={g}
        fontFamily={Mono}
        fontSize={13}
        fill={Colors.muted}
      />
    )),
  );
  yield* waitFor(0.5);
  if (supported) {
    yield* all(...rects.map((rect, i) => rect.fill(Gradients[i], 1)));
  } else {
    placeholder(
      view,
      'CSS gradient strings for fill/stroke, Gradient.lerp, parseCSSGradient',
      {
        y: -110,
        height: 150,
      },
    );
  }
  yield* waitFor(1);
  view.add(
    <Txt
      y={60}
      text={'SVG with <linearGradient> / <radialGradient> fills:'}
      fontFamily={Sans}
      fontSize={20}
      fill={Colors.text}
    />,
  );
  view.add(<SVG svg={WithGradient} y={160} width={330} />);
  yield* waitFor(3);
});
