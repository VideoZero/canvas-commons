import {
  Circle,
  Latex,
  Rect,
  SVG,
  Spline,
  Txt,
  makeScene2D,
} from '@canvas-commons/2d';
import {ThreadGenerator, all, waitFor} from '@canvas-commons/core';
import {Colors, Sans, caption, intro} from '../shared/ui';

type Buildable = {
  build?: (duration?: number, ...rest: unknown[]) => ThreadGenerator;
  unbuild?: (duration?: number, ...rest: unknown[]) => ThreadGenerator;
};

const Icon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120">
  <rect x="10" y="40" width="100" height="70" rx="8" fill="#58a6ff"/>
  <path d="M5 45 L60 8 L115 45" fill="none" stroke="#f0883e" stroke-width="8" stroke-linejoin="round"/>
  <rect x="48" y="70" width="24" height="40" fill="#0f1419"/>
  <circle cx="30" cy="62" r="9" fill="#e3b341"/>
  <circle cx="90" cy="62" r="9" fill="#e3b341"/>
</svg>`;

export default makeScene2D(function* (view) {
  yield* intro(
    view,
    'build-animation',
    'build() draws curves, SVGs and Latex on (unbuild() draws SVGs off); rough shapes clip to start/end.',
  );
  caption(
    view,
    'svg.build(2.5) · latex.build(2) · spline.build() · rough circle end 0 → 1',
  );

  const svg = (<SVG svg={Icon} x={-300} y={-40} width={220} />) as SVG;
  const tex = (
    <Latex
      tex={String.raw`e^{i\pi} + 1 = 0`}
      fill={Colors.text}
      y={-40}
      height={70}
    />
  ) as Latex;
  const spline = (
    <Spline
      points={[
        [-120, 70],
        [-40, 140],
        [40, 60],
        [120, 130],
      ]}
      stroke={Colors.green}
      lineWidth={8}
      lineCap="round"
    />
  ) as Spline;
  const rough = (
    <Circle
      x={300}
      y={-40}
      size={200}
      stroke={Colors.orange}
      lineWidth={4}
      rough
      roughness={1.5}
      roughSeed={3}
      end={0}
    />
  ) as Circle;
  const roughRect = (
    <Rect
      x={300}
      y={130}
      width={200}
      height={80}
      stroke={Colors.purple}
      lineWidth={4}
      rough
      roughSeed={5}
      end={0}
    />
  ) as Rect;
  view.add([svg, tex, spline, rough, roughRect]);
  const labels = [
    ['svg.build()', -300],
    ['latex.build() · spline.build()', 0],
    ['rough + end', 300],
  ] as const;
  for (const [text, x] of labels) {
    view.add(
      <Txt
        x={x}
        y={200}
        text={text}
        fontFamily={Sans}
        fontSize={18}
        fill={Colors.muted}
      />,
    );
  }

  const canBuild = typeof (svg as unknown as Buildable).build === 'function';
  const missing = (
    <Txt
      y={235}
      fontFamily={Sans}
      fontSize={18}
      fill={Colors.red}
      text={
        canBuild
          ? ''
          : 'build()/unbuild() not available on canvas-commons main — shapes just appear'
      }
    />
  );
  view.add(missing);
  const build = (node: unknown, duration: number): ThreadGenerator => {
    const fn = (node as Buildable).build;
    if (fn) return fn.call(node, duration);
    return (function* () {
      yield* waitFor(duration);
    })();
  };
  yield* all(
    build(svg, 2.5),
    build(tex, 2),
    build(spline, 1.5),
    rough.end(1, 2.5),
    roughRect.end(1, 2.5),
  );
  yield* waitFor(0.6);
  const unbuild = (svg as unknown as Buildable).unbuild;
  yield* all(
    unbuild ? unbuild.call(svg, 1.5) : waitFor(1.5),
    rough.end(0.3, 1.5),
    roughRect.end(0.4, 1.5),
  );
  yield* waitFor(1);
});
