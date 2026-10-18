import {
  Circle,
  Latex,
  Node,
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

// A small scene with many shapes, so the build order and overlap show.
const Landscape = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 200">
  <rect x="0" y="0" width="320" height="200" rx="14" fill="#16233a"/>
  <circle cx="250" cy="52" r="26" fill="#e3b341"/>
  <circle cx="60" cy="40" r="2.5" fill="#c9d1d9"/>
  <circle cx="100" cy="24" r="2" fill="#c9d1d9"/>
  <circle cx="160" cy="44" r="2.5" fill="#c9d1d9"/>
  <circle cx="200" cy="20" r="2" fill="#c9d1d9"/>
  <path d="M0 150 L70 70 L130 140 L190 60 L260 150 L320 110 L320 200 L0 200 Z" fill="#3fb950"/>
  <path d="M70 70 L84 86 L56 86 Z" fill="#f0f6fc"/>
  <path d="M190 60 L206 80 L174 80 Z" fill="#f0f6fc"/>
  <path d="M0 170 C80 150 160 190 320 160 L320 200 L0 200 Z" fill="#238636"/>
  <path d="M30 196 C90 172 150 186 200 160 S270 140 300 150" fill="none" stroke="#f0883e" stroke-width="5" stroke-linecap="round" stroke-dasharray="1 12"/>
  <rect x="40" y="128" width="8" height="26" fill="#6e4b2a"/>
  <path d="M44 100 L62 134 L26 134 Z" fill="#2ea043"/>
  <rect x="262" y="132" width="8" height="24" fill="#6e4b2a"/>
  <path d="M266 104 L284 138 L248 138 Z" fill="#2ea043"/>
  <path d="M110 34 C118 26 132 26 138 34 C146 30 156 36 152 44 L108 44 C102 40 104 34 110 34 Z" fill="#8b949e"/>
</svg>`;

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
  const first = caption(
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
  yield* waitFor(0.6);

  // Part two: the build options on a richer drawing and a larger formula.
  const part = new Node({opacity: 0});
  view.add(part);
  yield* all(
    ...[svg, tex, spline, rough, roughRect, missing].map(node =>
      node.opacity(0, 0.5),
    ),
    ...view
      .children()
      .filter(node => node instanceof Txt && node.y() === 200)
      .map(node => node.opacity(0, 0.5)),
    first.opacity(0, 0.5),
    part.opacity(1, 0.5),
  );

  const step = caption(
    view,
    'svg.build(4, {order: "forward", overlap: 0.1})',
    225,
  );
  const landscape = (
    <SVG svg={Landscape} x={-220} y={-20} width={420} />
  ) as SVG;
  const formula = (
    <Latex
      tex={String.raw`x = \frac{-b \pm \sqrt{b^2 - 4ac}}{2a}`}
      fill={Colors.text}
      x={230}
      y={-20}
      height={90}
    />
  ) as Latex;
  part.add([landscape, formula]);

  type BuildWith = (
    duration: number,
    timing?: unknown,
    options?: Record<string, unknown>,
  ) => ThreadGenerator;
  const run = (
    node: unknown,
    method: 'build' | 'unbuild',
    duration: number,
    options?: Record<string, unknown>,
  ): ThreadGenerator => {
    const fn = (node as Record<string, unknown>)[method];
    if (typeof fn === 'function') {
      return options
        ? (fn as BuildWith).call(node, duration, undefined, options)
        : (fn as BuildWith).call(node, duration);
    }
    return (function* () {
      yield* waitFor(duration);
    })();
  };

  yield* all(
    run(landscape, 'build', 4, {order: 'forward', overlap: 0.1}),
    run(formula, 'build', 3.5),
  );
  yield* waitFor(0.8);

  step.text('svg.unbuild(2.5, {order: "reverse", overlap: 0.6})');
  yield* run(landscape, 'unbuild', 2.5, {order: 'reverse', overlap: 0.6});
  yield* waitFor(0.4);

  step.text('svg.build(3, {order: "random", overlap: 0.85, outlineWidth: 3})');
  yield* run(landscape, 'build', 3, {
    order: 'random',
    overlap: 0.85,
    outlineWidth: 3,
  });
  yield* waitFor(1.2);
});
